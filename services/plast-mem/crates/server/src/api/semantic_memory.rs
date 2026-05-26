use axum::{Json, extract::State, http::StatusCode};
use chrono::Utc;
use plastmem_ai::embed;
use plastmem_core::SemanticMemory;
use plastmem_entities::semantic_memory;
use plastmem_shared::AppError;
use sea_orm::{
  ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, QuerySelect, Set,
};
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::utils::AppState;

#[derive(Debug, Deserialize, ToSchema)]
pub struct SemanticMemoryList {
  /// Conversation ID to list semantic facts from.
  pub conversation_id: Uuid,
  /// Optional category filter, e.g. "guideline", "preference", "identity".
  pub category: Option<String>,
  /// Include invalidated semantic facts.
  #[serde(default)]
  pub include_invalid: bool,
  /// Maximum memories to return (default: 50, max: 500).
  #[serde(default = "default_limit")]
  pub limit: u64,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SemanticMemorySetInvalid {
  /// Conversation ID that owns the semantic fact.
  pub conversation_id: Uuid,
  /// Semantic memory ID to update.
  pub memory_id: Uuid,
  /// Set to true to invalidate the fact, false to restore it.
  pub invalid: bool,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SemanticMemoryUpdate {
  /// Conversation ID that owns the semantic fact.
  pub conversation_id: Uuid,
  /// Semantic memory ID to update.
  pub memory_id: Uuid,
  /// Updated semantic memory category.
  pub category: String,
  /// Updated semantic memory fact text.
  pub fact: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SemanticMemoryDelete {
  /// Conversation ID that owns the semantic fact.
  pub conversation_id: Uuid,
  /// Semantic memory ID to delete.
  pub memory_id: Uuid,
}

const fn default_limit() -> u64 {
  50
}

fn sanitize_limit(value: u64) -> u64 {
  value.clamp(1, 500)
}

fn normalize_non_blank(value: &str) -> Option<String> {
  let normalized = value.trim();
  if normalized.is_empty() {
    return None;
  }

  Some(normalized.to_owned())
}

async fn load_semantic_memory(
  state: &AppState,
  conversation_id: Uuid,
  memory_id: Uuid,
) -> Result<semantic_memory::Model, AppError> {
  semantic_memory::Entity::find()
    .filter(semantic_memory::Column::Id.eq(memory_id))
    .filter(semantic_memory::Column::ConversationId.eq(conversation_id))
    .one(&state.db)
    .await?
    .ok_or_else(|| {
      AppError::with_status(
        StatusCode::NOT_FOUND,
        anyhow::anyhow!("Semantic memory not found"),
      )
    })
}

/// List semantic memories in raw JSON format (newest first).
#[utoipa::path(
  post,
  path = "/api/v0/semantic_memory/raw",
  request_body = SemanticMemoryList,
  responses(
    (status = 200, description = "Semantic memories", body = Vec<SemanticMemory>),
  )
)]
#[axum::debug_handler]
pub async fn semantic_memory_raw(
  State(state): State<AppState>,
  Json(payload): Json<SemanticMemoryList>,
) -> Result<Json<Vec<SemanticMemory>>, AppError> {
  let mut query = semantic_memory::Entity::find()
    .filter(semantic_memory::Column::ConversationId.eq(payload.conversation_id));

  if let Some(category) = payload.category.as_deref()
    && !category.trim().is_empty()
  {
    query = query.filter(semantic_memory::Column::Category.eq(category.trim()));
  }

  if !payload.include_invalid {
    query = query.filter(semantic_memory::Column::InvalidAt.is_null());
  }

  let models = query
    .order_by_desc(semantic_memory::Column::CreatedAt)
    .limit(sanitize_limit(payload.limit))
    .all(&state.db)
    .await?;

  Ok(Json(
    models.into_iter().map(SemanticMemory::from_model).collect(),
  ))
}

/// Mark a semantic memory invalid, or restore it as active.
#[utoipa::path(
  post,
  path = "/api/v0/semantic_memory/set_invalid",
  request_body = SemanticMemorySetInvalid,
  responses(
    (status = 200, description = "Updated semantic memory", body = SemanticMemory),
    (status = 404, description = "Semantic memory not found"),
  )
)]
#[axum::debug_handler]
pub async fn semantic_memory_set_invalid(
  State(state): State<AppState>,
  Json(payload): Json<SemanticMemorySetInvalid>,
) -> Result<Json<SemanticMemory>, AppError> {
  let model = load_semantic_memory(&state, payload.conversation_id, payload.memory_id).await?;

  let mut active: semantic_memory::ActiveModel = model.into();
  active.invalid_at = Set(if payload.invalid {
    Some(Utc::now().into())
  } else {
    None
  });

  let updated = active.update(&state.db).await?;
  Ok(Json(SemanticMemory::from_model(updated)))
}

/// Update a semantic memory fact and category, recomputing its embedding.
#[utoipa::path(
  post,
  path = "/api/v0/semantic_memory/update",
  request_body = SemanticMemoryUpdate,
  responses(
    (status = 200, description = "Updated semantic memory", body = SemanticMemory),
    (status = 400, description = "Invalid semantic memory payload"),
    (status = 404, description = "Semantic memory not found"),
  )
)]
#[axum::debug_handler]
pub async fn semantic_memory_update(
  State(state): State<AppState>,
  Json(payload): Json<SemanticMemoryUpdate>,
) -> Result<Json<SemanticMemory>, AppError> {
  let category = payload.category.trim().to_owned();
  let fact = normalize_non_blank(&payload.fact).ok_or_else(|| {
    AppError::with_status(
      StatusCode::BAD_REQUEST,
      anyhow::anyhow!("Semantic memory fact must not be empty"),
    )
  })?;

  let model = load_semantic_memory(&state, payload.conversation_id, payload.memory_id).await?;
  let embedding = embed(&fact).await?;

  let mut active: semantic_memory::ActiveModel = model.into();
  active.category = Set(category);
  active.fact = Set(fact);
  active.embedding = Set(embedding);

  let updated = active.update(&state.db).await?;
  Ok(Json(SemanticMemory::from_model(updated)))
}

/// Permanently delete a semantic memory.
#[utoipa::path(
  post,
  path = "/api/v0/semantic_memory/delete",
  request_body = SemanticMemoryDelete,
  responses(
    (status = 200, description = "Semantic memory deleted"),
    (status = 404, description = "Semantic memory not found"),
  )
)]
#[axum::debug_handler]
pub async fn semantic_memory_delete(
  State(state): State<AppState>,
  Json(payload): Json<SemanticMemoryDelete>,
) -> Result<StatusCode, AppError> {
  let model = load_semantic_memory(&state, payload.conversation_id, payload.memory_id).await?;
  let active: semantic_memory::ActiveModel = model.into();
  active.delete(&state.db).await?;
  Ok(StatusCode::OK)
}
