use axum::{Json, extract::State, http::StatusCode};
use chrono::{DateTime, Utc};
use plastmem_ai::embed;
use plastmem_core::EpisodicMemory;
use plastmem_entities::{
  EpisodeClassification, conversation_message, episode_span, episodic_memory, pending_review_queue,
  semantic_memory,
};
use plastmem_shared::{AppError, MessageRole};
use sea_orm::{
  ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, DbBackend, EntityTrait,
  PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Set, Statement,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::review_window::{is_review_due, resolve_review_window_hours};
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
  pub due_pending_reviews: u64,
  pub deferred_pending_reviews: u64,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ConversationMessagesList {
  pub conversation_id: Uuid,
  #[serde(default = "default_message_limit")]
  pub limit: u64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ConversationMessageView {
  pub seq: i64,
  pub role: String,
  pub speaker_name: Option<String>,
  pub content: String,
  pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ConversationMessageUpdate {
  pub conversation_id: Uuid,
  pub seq: i64,
  pub role: String,
  pub speaker_name: Option<String>,
  pub content: String,
  pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct EpisodeSpansList {
  pub conversation_id: Uuid,
  #[serde(default = "default_span_limit")]
  pub limit: u64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct EpisodeSpanView {
  pub start_seq: i64,
  pub end_seq: i64,
  pub classification: String,
  pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct EpisodicMemoryUpdate {
  pub conversation_id: Uuid,
  pub memory_id: Uuid,
  pub title: String,
  pub content: String,
}

const fn default_message_limit() -> u64 {
  200
}

const fn default_span_limit() -> u64 {
  200
}

fn sanitize_list_limit(limit: u64) -> u64 {
  limit.clamp(1, 500)
}

fn episode_classification_label(classification: &EpisodeClassification) -> String {
  match classification {
    EpisodeClassification::LowInfo => "low_info".to_string(),
    EpisodeClassification::Informative => "informative".to_string(),
  }
}

fn normalize_non_blank(value: &str, label: &str) -> Result<String, AppError> {
  let normalized = value.trim();
  if normalized.is_empty() {
    return Err(AppError::with_status(
      StatusCode::BAD_REQUEST,
      anyhow::anyhow!("{label} must not be empty"),
    ));
  }

  Ok(normalized.to_owned())
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
  let reviewed_at = Utc::now();
  let review_window_hours = resolve_review_window_hours();
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
  let pending_review_rows = pending_review_queue::Entity::find()
    .filter(pending_review_queue::Column::ConversationId.eq(conversation_id))
    .filter(pending_review_queue::Column::ConsumedAt.is_null())
    .all(db)
    .await?;
  let related_memory_ids = pending_review_rows
    .iter()
    .flat_map(|item| item.memory_ids.iter().copied())
    .collect::<Vec<_>>();
  let episodic_memory_models = if related_memory_ids.is_empty() {
    Vec::new()
  } else {
    episodic_memory::Entity::find()
      .filter(episodic_memory::Column::Id.is_in(related_memory_ids))
      .all(db)
      .await?
  };
  let memory_last_reviewed_at = episodic_memory_models
    .into_iter()
    .map(|memory| (memory.id, memory.last_reviewed_at.with_timezone(&Utc)))
    .collect::<std::collections::HashMap<_, _>>();
  let mut due_pending_reviews = 0u64;
  let mut deferred_pending_reviews = 0u64;

  for item in pending_review_rows {
    let has_due_memory = item.memory_ids.iter().any(|memory_id| {
      memory_last_reviewed_at
        .get(memory_id)
        .is_some_and(|last_reviewed_at| {
          is_review_due(*last_reviewed_at, reviewed_at, review_window_hours)
        })
    });

    if has_due_memory {
      due_pending_reviews += 1;
    } else {
      deferred_pending_reviews += 1;
    }
  }

  Ok(HealthCounts {
    conversation_messages,
    episode_spans,
    episodic_memories,
    semantic_memories,
    active_semantic_memories,
    pending_reviews,
    due_pending_reviews,
    deferred_pending_reviews,
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

#[utoipa::path(
  post,
  path = "/api/v0/health/conversation_messages",
  request_body = ConversationMessagesList,
  responses(
    (status = 200, description = "Conversation messages", body = Vec<ConversationMessageView>),
  )
)]
#[axum::debug_handler]
pub async fn conversation_messages_raw(
  State(state): State<AppState>,
  Json(payload): Json<ConversationMessagesList>,
) -> Result<Json<Vec<ConversationMessageView>>, AppError> {
  let models = conversation_message::Entity::find()
    .filter(conversation_message::Column::ConversationId.eq(payload.conversation_id))
    .order_by_desc(conversation_message::Column::Seq)
    .limit(sanitize_list_limit(payload.limit))
    .all(&state.db)
    .await?;

  Ok(Json(
    models
      .into_iter()
      .map(|message| ConversationMessageView {
        seq: message.seq,
        role: message.role,
        speaker_name: message.speaker_name,
        content: message.content,
        timestamp: message.timestamp.with_timezone(&Utc),
      })
      .collect(),
  ))
}

#[utoipa::path(
  post,
  path = "/api/v0/health/episode_spans",
  request_body = EpisodeSpansList,
  responses(
    (status = 200, description = "Episode spans", body = Vec<EpisodeSpanView>),
  )
)]
#[axum::debug_handler]
pub async fn episode_spans_raw(
  State(state): State<AppState>,
  Json(payload): Json<EpisodeSpansList>,
) -> Result<Json<Vec<EpisodeSpanView>>, AppError> {
  let models = episode_span::Entity::find()
    .filter(episode_span::Column::ConversationId.eq(payload.conversation_id))
    .order_by_desc(episode_span::Column::CreatedAt)
    .limit(sanitize_list_limit(payload.limit))
    .all(&state.db)
    .await?;

  Ok(Json(
    models
      .into_iter()
      .map(|span| EpisodeSpanView {
        start_seq: span.start_seq,
        end_seq: span.end_seq,
        classification: episode_classification_label(&span.classification),
        created_at: span.created_at.with_timezone(&Utc),
      })
      .collect(),
  ))
}

/// Update a stored conversation message.
#[utoipa::path(
  post,
  path = "/api/v0/health/conversation_messages/update",
  request_body = ConversationMessageUpdate,
  responses(
    (status = 200, description = "Updated conversation message", body = ConversationMessageView),
    (status = 400, description = "Invalid conversation message payload"),
    (status = 404, description = "Conversation message not found"),
  )
)]
#[axum::debug_handler]
pub async fn conversation_message_update(
  State(state): State<AppState>,
  Json(payload): Json<ConversationMessageUpdate>,
) -> Result<Json<ConversationMessageView>, AppError> {
  let role = normalize_non_blank(&payload.role, "Conversation message role")?;
  let content = normalize_non_blank(&payload.content, "Conversation message content")?;
  let speaker_name = payload
    .speaker_name
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(ToOwned::to_owned);

  let model = conversation_message::Entity::find()
    .filter(conversation_message::Column::ConversationId.eq(payload.conversation_id))
    .filter(conversation_message::Column::Seq.eq(payload.seq))
    .one(&state.db)
    .await?
    .ok_or_else(|| {
      AppError::with_status(
        StatusCode::NOT_FOUND,
        anyhow::anyhow!("Conversation message not found"),
      )
    })?;

  let mut active: conversation_message::ActiveModel = model.into();
  active.role = Set(MessageRole::from(role).to_string());
  active.speaker_name = Set(speaker_name);
  active.content = Set(content);
  active.timestamp = Set(payload.timestamp.into());

  let updated = active.update(&state.db).await?;
  Ok(Json(ConversationMessageView {
    seq: updated.seq,
    role: updated.role,
    speaker_name: updated.speaker_name,
    content: updated.content,
    timestamp: updated.timestamp.with_timezone(&Utc),
  }))
}

/// Update an episodic memory title and content.
#[utoipa::path(
  post,
  path = "/api/v0/health/episodic_memories/update",
  request_body = EpisodicMemoryUpdate,
  responses(
    (status = 200, description = "Updated episodic memory", body = plastmem_core::EpisodicMemory),
    (status = 400, description = "Invalid episodic memory payload"),
    (status = 404, description = "Episodic memory not found"),
  )
)]
#[axum::debug_handler]
pub async fn episodic_memory_update(
  State(state): State<AppState>,
  Json(payload): Json<EpisodicMemoryUpdate>,
) -> Result<Json<EpisodicMemory>, AppError> {
  let title = normalize_non_blank(&payload.title, "Episodic memory title")?;
  let content = normalize_non_blank(&payload.content, "Episodic memory content")?;

  let model = episodic_memory::Entity::find()
    .filter(episodic_memory::Column::Id.eq(payload.memory_id))
    .filter(episodic_memory::Column::ConversationId.eq(payload.conversation_id))
    .one(&state.db)
    .await?
    .ok_or_else(|| {
      AppError::with_status(
        StatusCode::NOT_FOUND,
        anyhow::anyhow!("Episodic memory not found"),
      )
    })?;
  let embedding = embed(&content).await?;

  let mut active: episodic_memory::ActiveModel = model.into();
  active.title = Set(title);
  active.content = Set(content);
  active.embedding = Set(embedding);

  let updated = active.update(&state.db).await?;
  Ok(Json(EpisodicMemory::from_model(updated)?))
}
