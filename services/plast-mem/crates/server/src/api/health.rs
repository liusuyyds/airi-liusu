use axum::{Json, extract::State};
use chrono::{DateTime, Utc};
use plastmem_entities::{
  conversation_message, episode_span, episodic_memory, pending_review_queue, semantic_memory,
};
use plastmem_shared::AppError;
use sea_orm::{
  ColumnTrait, ConnectionTrait, DatabaseConnection, DbBackend, EntityTrait, PaginatorTrait,
  QueryFilter, Statement,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::utils::AppState;

#[derive(Debug, Deserialize, ToSchema)]
pub struct HealthCheck {
  /// Optional conversation ID to include conversation-scoped table counts.
  pub conversation_id: Option<Uuid>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct HealthCounts {
  pub conversation_messages: u64,
  pub episode_spans: u64,
  pub episodic_memories: u64,
  pub semantic_memories: u64,
  pub active_semantic_memories: u64,
  pub pending_reviews: u64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct HealthCheckResult {
  pub database_ok: bool,
  pub database_error: Option<String>,
  pub server_time: DateTime<Utc>,
  pub conversation_id: Option<Uuid>,
  pub counts: Option<HealthCounts>,
}

async fn ping_database(db: &DatabaseConnection) -> Result<(), sea_orm::DbErr> {
  db.query_one_raw(Statement::from_string(
    DbBackend::Postgres,
    "SELECT 1".to_string(),
  ))
  .await?;
  Ok(())
}

async fn fetch_counts(
  conversation_id: Uuid,
  db: &DatabaseConnection,
) -> Result<HealthCounts, sea_orm::DbErr> {
  let conversation_messages = conversation_message::Entity::find()
    .filter(conversation_message::Column::ConversationId.eq(conversation_id))
    .count(db)
    .await?;
  let episode_spans = episode_span::Entity::find()
    .filter(episode_span::Column::ConversationId.eq(conversation_id))
    .count(db)
    .await?;
  let episodic_memories = episodic_memory::Entity::find()
    .filter(episodic_memory::Column::ConversationId.eq(conversation_id))
    .count(db)
    .await?;
  let semantic_memories = semantic_memory::Entity::find()
    .filter(semantic_memory::Column::ConversationId.eq(conversation_id))
    .count(db)
    .await?;
  let active_semantic_memories = semantic_memory::Entity::find()
    .filter(semantic_memory::Column::ConversationId.eq(conversation_id))
    .filter(semantic_memory::Column::InvalidAt.is_null())
    .count(db)
    .await?;
  let pending_reviews = pending_review_queue::Entity::find()
    .filter(pending_review_queue::Column::ConversationId.eq(conversation_id))
    .filter(pending_review_queue::Column::ConsumedAt.is_null())
    .count(db)
    .await?;

  Ok(HealthCounts {
    conversation_messages,
    episode_spans,
    episodic_memories,
    semantic_memories,
    active_semantic_memories,
    pending_reviews,
  })
}

/// Check database reachability and conversation-scoped memory table counts.
#[utoipa::path(
  post,
  path = "/api/v0/health",
  request_body = HealthCheck,
  responses(
    (status = 200, description = "Database health and optional memory counts", body = HealthCheckResult),
  )
)]
#[axum::debug_handler]
pub async fn health(
  State(state): State<AppState>,
  Json(payload): Json<HealthCheck>,
) -> Result<Json<HealthCheckResult>, AppError> {
  let server_time = Utc::now();

  if let Err(error) = ping_database(&state.db).await {
    return Ok(Json(HealthCheckResult {
      database_ok: false,
      database_error: Some(error.to_string()),
      server_time,
      conversation_id: payload.conversation_id,
      counts: None,
    }));
  }

  let counts = if let Some(conversation_id) = payload.conversation_id {
    match fetch_counts(conversation_id, &state.db).await {
      Ok(counts) => Some(counts),
      Err(error) => {
        return Ok(Json(HealthCheckResult {
          database_ok: false,
          database_error: Some(error.to_string()),
          server_time,
          conversation_id: payload.conversation_id,
          counts: None,
        }));
      }
    }
  } else {
    None
  };

  Ok(Json(HealthCheckResult {
    database_ok: true,
    database_error: None,
    server_time,
    conversation_id: payload.conversation_id,
    counts,
  }))
}
