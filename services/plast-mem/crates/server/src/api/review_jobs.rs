use std::any::type_name;

use axum::{Json, extract::State};
use chrono::{DateTime, Utc};
use plastmem_shared::AppError;
use plastmem_shared::Message;
use plastmem_worker::MemoryReviewJob;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, FromQueryResult, Statement};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use utoipa::ToSchema;

use crate::utils::AppState;

#[derive(Debug, Deserialize, ToSchema)]
pub struct FailedReviewJobList {
  /// Maximum failed jobs to return (default: 20, max: 100).
  #[serde(default = "default_failed_review_job_limit")]
  pub limit: u64,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct FailedReviewJobRetry {
  /// Apalis job ID to reset back to Pending.
  pub job_id: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct FailedReviewJob {
  pub id: String,
  pub status: String,
  pub attempts: i32,
  pub max_attempts: i32,
  pub run_at: DateTime<Utc>,
  pub done_at: Option<DateTime<Utc>>,
  pub error: String,
  pub review: FailedReviewJobReview,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct FailedReviewJobRetryResult {
  pub ok: bool,
  pub job_id: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct FailedReviewJobReview {
  pub title: String,
  pub pending_reviews: Vec<FailedReviewJobPendingReview>,
  pub context_messages: Vec<FailedReviewJobContextMessage>,
  pub reviewed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct FailedReviewJobPendingReview {
  pub query: String,
  pub memory_count: usize,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct FailedReviewJobContextMessage {
  pub speaker: String,
  pub content: String,
}

#[derive(Debug, FromQueryResult)]
struct FailedReviewJobRow {
  id: String,
  job: Vec<u8>,
  status: String,
  attempts: i32,
  max_attempts: i32,
  run_at: DateTime<Utc>,
  done_at: Option<DateTime<Utc>>,
  last_result: Option<JsonValue>,
}

const MEMORY_REVIEW_FAILED_STATUSES: [&str; 2] = ["Failed", "Killed"];

const fn default_failed_review_job_limit() -> u64 {
  20
}

fn sanitize_failed_review_job_limit(limit: u64) -> u64 {
  limit.clamp(1, 100)
}

fn memory_review_job_type() -> &'static str {
  type_name::<MemoryReviewJob>()
}

fn error_text_from_last_result(last_result: Option<JsonValue>) -> String {
  let Some(value) = last_result else {
    return "Unknown worker error".to_owned();
  };

  if let Some(message) = value.get("Err").and_then(JsonValue::as_str) {
    return message.to_owned();
  }

  if let Some(message) = value.as_str() {
    return message.to_owned();
  }

  value.to_string()
}

fn speaker_from_message(message: &Message) -> String {
  if let Some(name) = message
    .name
    .as_deref()
    .filter(|name| !name.trim().is_empty())
  {
    return format!("{} ({name})", message.role);
  }

  message.role.to_string()
}

fn compact_text(value: &str, max_chars: usize) -> String {
  let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
  if normalized.chars().count() <= max_chars {
    return normalized;
  }

  format!(
    "{}...",
    normalized
      .chars()
      .take(max_chars.saturating_sub(3))
      .collect::<String>()
  )
}

fn review_from_job_bytes(job: &[u8]) -> FailedReviewJobReview {
  let Ok(review_job) = serde_json::from_slice::<MemoryReviewJob>(job) else {
    return FailedReviewJobReview {
      title: "Memory review task".to_owned(),
      pending_reviews: Vec::new(),
      context_messages: Vec::new(),
      reviewed_at: Utc::now(),
    };
  };

  let first_query = review_job
    .pending_reviews
    .first()
    .map(|review| compact_text(&review.query, 64))
    .filter(|query| !query.is_empty())
    .unwrap_or_else(|| "Memory review task".to_owned());

  FailedReviewJobReview {
    title: first_query,
    pending_reviews: review_job
      .pending_reviews
      .iter()
      .map(|review| FailedReviewJobPendingReview {
        query: review.query.clone(),
        memory_count: review.memory_ids.len(),
      })
      .collect(),
    context_messages: review_job
      .context_messages
      .iter()
      .rev()
      .take(3)
      .rev()
      .map(|message| FailedReviewJobContextMessage {
        speaker: speaker_from_message(message),
        content: compact_text(&message.content, 160),
      })
      .collect(),
    reviewed_at: review_job.reviewed_at,
  }
}

async fn list_failed_review_jobs(
  limit: u64,
  db: &DatabaseConnection,
) -> Result<Vec<FailedReviewJob>, AppError> {
  let sql = "\
    SELECT id, job, status, attempts, max_attempts, run_at, done_at, last_result \
    FROM apalis.jobs \
    WHERE job_type = $1 AND status IN ($2, $3) \
    ORDER BY COALESCE(done_at, run_at) DESC \
    LIMIT $4";

  let rows = FailedReviewJobRow::find_by_statement(Statement::from_sql_and_values(
    DbBackend::Postgres,
    sql,
    [
      memory_review_job_type().into(),
      MEMORY_REVIEW_FAILED_STATUSES[0].into(),
      MEMORY_REVIEW_FAILED_STATUSES[1].into(),
      i64::try_from(limit).unwrap_or(100).into(),
    ],
  ))
  .all(db)
  .await?;

  Ok(
    rows
      .into_iter()
      .map(|row| FailedReviewJob {
        id: row.id,
        status: row.status,
        attempts: row.attempts,
        max_attempts: row.max_attempts,
        run_at: row.run_at,
        done_at: row.done_at,
        error: error_text_from_last_result(row.last_result),
        review: review_from_job_bytes(&row.job),
      })
      .collect(),
  )
}

async fn retry_failed_review_job(job_id: &str, db: &DatabaseConnection) -> Result<bool, AppError> {
  let sql = "\
    UPDATE apalis.jobs \
    SET status = 'Pending', \
        attempts = 0, \
        run_at = now(), \
        lock_at = NULL, \
        lock_by = NULL, \
        done_at = NULL \
    WHERE id = $1 \
      AND job_type = $2 \
      AND status IN ($3, $4)";

  let result = db
    .execute_raw(Statement::from_sql_and_values(
      DbBackend::Postgres,
      sql,
      [
        job_id.to_owned().into(),
        memory_review_job_type().into(),
        MEMORY_REVIEW_FAILED_STATUSES[0].into(),
        MEMORY_REVIEW_FAILED_STATUSES[1].into(),
      ],
    ))
    .await?;

  Ok(result.rows_affected() > 0)
}

async fn memory_review_job_exists(job_id: &str, db: &DatabaseConnection) -> Result<bool, AppError> {
  let sql = "\
    SELECT id, job, status, attempts, max_attempts, run_at, done_at, last_result \
    FROM apalis.jobs \
    WHERE id = $1 AND job_type = $2 \
    LIMIT 1";

  let row = FailedReviewJobRow::find_by_statement(Statement::from_sql_and_values(
    DbBackend::Postgres,
    sql,
    [job_id.to_owned().into(), memory_review_job_type().into()],
  ))
  .one(db)
  .await?;

  Ok(row.is_some())
}

/// List failed Plast Mem memory-review jobs.
#[utoipa::path(
  post,
  path = "/api/v0/review_jobs/failures",
  request_body = FailedReviewJobList,
  responses(
    (status = 200, description = "Failed memory-review jobs", body = Vec<FailedReviewJob>),
  )
)]
#[axum::debug_handler]
pub async fn review_job_failures(
  State(state): State<AppState>,
  Json(payload): Json<FailedReviewJobList>,
) -> Result<Json<Vec<FailedReviewJob>>, AppError> {
  Ok(Json(
    list_failed_review_jobs(sanitize_failed_review_job_limit(payload.limit), &state.db).await?,
  ))
}

/// Retry a failed Plast Mem memory-review job.
#[utoipa::path(
  post,
  path = "/api/v0/review_jobs/retry",
  request_body = FailedReviewJobRetry,
  responses(
    (status = 200, description = "Memory-review job reset to pending", body = FailedReviewJobRetryResult),
  )
)]
#[axum::debug_handler]
pub async fn review_job_retry(
  State(state): State<AppState>,
  Json(payload): Json<FailedReviewJobRetry>,
) -> Result<Json<FailedReviewJobRetryResult>, AppError> {
  let retried = retry_failed_review_job(&payload.job_id, &state.db).await?;
  let ok = retried || memory_review_job_exists(&payload.job_id, &state.db).await?;

  Ok(Json(FailedReviewJobRetryResult {
    ok,
    job_id: payload.job_id,
  }))
}
