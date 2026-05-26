use axum::{Json, extract::State, http::StatusCode};
use chrono::{DateTime, Utc};
use fsrs::{DEFAULT_PARAMETERS, FSRS, MemoryState};
use plastmem_ai::embed;
use plastmem_core::{
  consume_pending_review_item, get_pending_review_item, list_pending_review_items,
  update_pending_review_item_query,
};
use plastmem_entities::episodic_memory;
use plastmem_shared::{AppError, fsrs::DESIRED_RETENTION};
use sea_orm::{
  ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter, Set, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::utils::AppState;
use crate::review_window::{is_review_due, resolve_review_window_hours};

#[derive(Debug, Clone, Copy, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum PendingReviewQueueStatus {
  Due,
  Deferred,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct PendingReviewQueueMemory {
  pub id: Uuid,
  pub title: String,
  pub content: String,
  pub created_at: DateTime<Utc>,
  pub last_reviewed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct PendingReviewQueueItemView {
  pub id: Uuid,
  pub conversation_id: Uuid,
  pub query: String,
  pub memory_ids: Vec<Uuid>,
  pub created_at: DateTime<Utc>,
  pub due_memory_count: u64,
  pub deferred_memory_count: u64,
  pub review_status: PendingReviewQueueStatus,
  pub memories: Vec<PendingReviewQueueMemory>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct PendingReviewQueueList {
  /// Conversation ID to list pending review items from.
  pub conversation_id: Uuid,
  /// Maximum queue items to return (default: 20, max: 100).
  #[serde(default = "default_queue_limit")]
  pub limit: u64,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct PendingReviewQueueRewrite {
  /// Conversation ID that owns the queue item.
  pub conversation_id: Uuid,
  /// Queue item ID to update.
  pub item_id: Uuid,
  /// Updated retrieval query / review note text.
  pub query: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct PendingReviewQueueApprove {
  /// Conversation ID that owns the queue item.
  pub conversation_id: Uuid,
  /// Queue item ID to approve.
  pub item_id: Uuid,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct PendingReviewQueueDismiss {
  /// Conversation ID that owns the queue item.
  pub conversation_id: Uuid,
  /// Queue item ID to dismiss without applying a review.
  pub item_id: Uuid,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct PendingReviewQueueUpdateMemory {
  /// Conversation ID that owns the queue item and memory.
  pub conversation_id: Uuid,
  /// Queue item ID that links the memory being edited.
  pub item_id: Uuid,
  /// Episodic memory ID to update.
  pub memory_id: Uuid,
  /// Updated episodic memory title.
  pub title: String,
  /// Updated episodic memory content.
  pub content: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct PendingReviewQueueActionResult {
  pub ok: bool,
  pub item_id: Uuid,
  pub consumed: bool,
  pub updated_memories: u64,
}

const fn default_queue_limit() -> u64 {
  20
}

fn sanitize_queue_limit(limit: u64) -> u64 {
  limit.clamp(1, 100)
}

fn normalize_non_blank(value: &str) -> Option<String> {
  let normalized = value.trim();
  if normalized.is_empty() {
    return None;
  }

  Some(normalized.to_owned())
}

async fn load_pending_review_or_404<C>(
  conversation_id: Uuid,
  item_id: Uuid,
  db: &C,
) -> Result<plastmem_core::PendingReviewQueueItem, AppError>
where
  C: ConnectionTrait,
{
  get_pending_review_item(conversation_id, item_id, db)
    .await?
    .ok_or_else(|| {
      AppError::with_status(
        StatusCode::NOT_FOUND,
        anyhow::anyhow!("Pending review item not found"),
      )
    })
}

async fn load_review_memories<C>(
  memory_ids: &[Uuid],
  db: &C,
) -> Result<Vec<episodic_memory::Model>, AppError>
where
  C: ConnectionTrait,
{
  if memory_ids.is_empty() {
    return Ok(Vec::new());
  }

  episodic_memory::Entity::find()
    .filter(episodic_memory::Column::Id.is_in(memory_ids.to_vec()))
    .all(db)
    .await
    .map_err(AppError::from)
}

async fn item_view_from_queue_item<C>(
  item: plastmem_core::PendingReviewQueueItem,
  db: &C,
) -> Result<PendingReviewQueueItemView, AppError>
where
  C: ConnectionTrait,
{
  let reviewed_at = Utc::now();
  let review_window_hours = resolve_review_window_hours();
  let mut due_memory_count = 0u64;
  let mut deferred_memory_count = 0u64;
  let memories = load_review_memories(&item.memory_ids, db)
    .await?
    .into_iter()
    .map(|memory| {
      let last_reviewed_at = memory.last_reviewed_at.with_timezone(&Utc);
      if is_review_due(last_reviewed_at, reviewed_at, review_window_hours) {
        due_memory_count += 1;
      } else {
        deferred_memory_count += 1;
      }

      PendingReviewQueueMemory {
        id: memory.id,
        title: memory.title,
        content: memory.content,
        created_at: memory.created_at.with_timezone(&Utc),
        last_reviewed_at,
      }
    })
    .collect();

  Ok(PendingReviewQueueItemView {
    id: item.id,
    conversation_id: item.conversation_id,
    query: item.query,
    memory_ids: item.memory_ids,
    created_at: item.created_at,
    due_memory_count,
    deferred_memory_count,
    review_status: if due_memory_count > 0 {
      PendingReviewQueueStatus::Due
    } else {
      PendingReviewQueueStatus::Deferred
    },
    memories,
  })
}

/// List pending review queue items with episodic memory previews.
#[utoipa::path(
  post,
  path = "/api/v0/review_queue/raw",
  request_body = PendingReviewQueueList,
  responses(
    (status = 200, description = "Pending review queue items", body = Vec<PendingReviewQueueItemView>),
  )
)]
#[axum::debug_handler]
pub async fn review_queue_raw(
  State(state): State<AppState>,
  Json(payload): Json<PendingReviewQueueList>,
) -> Result<Json<Vec<PendingReviewQueueItemView>>, AppError> {
  let items = list_pending_review_items(
    payload.conversation_id,
    sanitize_queue_limit(payload.limit),
    &state.db,
  )
  .await?;

  let mut views = Vec::with_capacity(items.len());
  for item in items {
    views.push(item_view_from_queue_item(item, &state.db).await?);
  }

  Ok(Json(views))
}

/// Rewrite a pending review queue item's query text.
#[utoipa::path(
  post,
  path = "/api/v0/review_queue/rewrite",
  request_body = PendingReviewQueueRewrite,
  responses(
    (status = 200, description = "Updated review queue item", body = PendingReviewQueueItemView),
    (status = 400, description = "Invalid review queue payload"),
    (status = 404, description = "Pending review item not found"),
  )
)]
#[axum::debug_handler]
pub async fn review_queue_rewrite(
  State(state): State<AppState>,
  Json(payload): Json<PendingReviewQueueRewrite>,
) -> Result<Json<PendingReviewQueueItemView>, AppError> {
  let query = normalize_non_blank(&payload.query).ok_or_else(|| {
    AppError::with_status(
      StatusCode::BAD_REQUEST,
      anyhow::anyhow!("Pending review query must not be empty"),
    )
  })?;

  let updated =
    update_pending_review_item_query(payload.conversation_id, payload.item_id, query, &state.db)
      .await?
      .ok_or_else(|| {
        AppError::with_status(
          StatusCode::NOT_FOUND,
          anyhow::anyhow!("Pending review item not found"),
        )
      })?;

  Ok(Json(item_view_from_queue_item(updated, &state.db).await?))
}

/// Update an episodic memory linked from a pending review queue item.
#[utoipa::path(
  post,
  path = "/api/v0/review_queue/update_memory",
  request_body = PendingReviewQueueUpdateMemory,
  responses(
    (status = 200, description = "Updated review queue item after linked memory edit", body = PendingReviewQueueItemView),
    (status = 400, description = "Invalid linked memory payload"),
    (status = 404, description = "Pending review item or linked memory not found"),
  )
)]
#[axum::debug_handler]
pub async fn review_queue_update_memory(
  State(state): State<AppState>,
  Json(payload): Json<PendingReviewQueueUpdateMemory>,
) -> Result<Json<PendingReviewQueueItemView>, AppError> {
  let title = normalize_non_blank(&payload.title).ok_or_else(|| {
    AppError::with_status(
      StatusCode::BAD_REQUEST,
      anyhow::anyhow!("Pending review memory title must not be empty"),
    )
  })?;
  let content = normalize_non_blank(&payload.content).ok_or_else(|| {
    AppError::with_status(
      StatusCode::BAD_REQUEST,
      anyhow::anyhow!("Pending review memory content must not be empty"),
    )
  })?;

  let item = load_pending_review_or_404(payload.conversation_id, payload.item_id, &state.db).await?;
  if !item.memory_ids.contains(&payload.memory_id) {
    return Err(AppError::with_status(
      StatusCode::NOT_FOUND,
      anyhow::anyhow!("Linked episodic memory not found in this review item"),
    ));
  }

  let model = episodic_memory::Entity::find()
    .filter(episodic_memory::Column::Id.eq(payload.memory_id))
    .filter(episodic_memory::Column::ConversationId.eq(payload.conversation_id))
    .one(&state.db)
    .await?
    .ok_or_else(|| {
      AppError::with_status(
        StatusCode::NOT_FOUND,
        anyhow::anyhow!("Linked episodic memory not found"),
      )
    })?;
  let embedding = embed(&content).await?;

  let mut active: episodic_memory::ActiveModel = model.into();
  active.title = Set(title);
  active.content = Set(content);
  active.embedding = Set(embedding);
  active.update(&state.db).await?;

  Ok(Json(item_view_from_queue_item(item, &state.db).await?))
}

/// Approve a pending review queue item by applying a manual positive FSRS review.
#[utoipa::path(
  post,
  path = "/api/v0/review_queue/approve",
  request_body = PendingReviewQueueApprove,
  responses(
    (status = 200, description = "Pending review item approved", body = PendingReviewQueueActionResult),
    (status = 404, description = "Pending review item not found"),
  )
)]
#[axum::debug_handler]
pub async fn review_queue_approve(
  State(state): State<AppState>,
  Json(payload): Json<PendingReviewQueueApprove>,
) -> Result<Json<PendingReviewQueueActionResult>, AppError> {
  let reviewed_at = Utc::now();
  let txn = state.db.begin().await?;
  let item = load_pending_review_or_404(payload.conversation_id, payload.item_id, &txn).await?;
  let fsrs = FSRS::new(Some(&DEFAULT_PARAMETERS))?;
  let mut updated_memories = 0u64;

  for model in load_review_memories(&item.memory_ids, &txn).await? {
    let last_reviewed_at = model.last_reviewed_at.with_timezone(&Utc);
    let days_elapsed = u32::try_from(
      (reviewed_at - last_reviewed_at)
        .num_days()
        .clamp(0, 365 * 100),
    )
    .unwrap_or(0);

    let current_state = MemoryState {
      stability: model.stability,
      difficulty: model.difficulty,
    };
    let next_states = fsrs.next_states(Some(current_state), DESIRED_RETENTION, days_elapsed)?;

    let mut active_model: episodic_memory::ActiveModel = model.into();
    active_model.stability = Set(next_states.good.memory.stability);
    active_model.difficulty = Set(next_states.good.memory.difficulty);
    active_model.last_reviewed_at = Set(reviewed_at.into());
    active_model.update(&txn).await?;
    updated_memories += 1;
  }

  let consumed =
    consume_pending_review_item(payload.conversation_id, payload.item_id, reviewed_at, &txn)
      .await?;
  txn.commit().await?;

  Ok(Json(PendingReviewQueueActionResult {
    ok: consumed,
    item_id: payload.item_id,
    consumed,
    updated_memories,
  }))
}

/// Dismiss a pending review queue item without applying a review update.
#[utoipa::path(
  post,
  path = "/api/v0/review_queue/dismiss",
  request_body = PendingReviewQueueDismiss,
  responses(
    (status = 200, description = "Pending review item dismissed", body = PendingReviewQueueActionResult),
    (status = 404, description = "Pending review item not found"),
  )
)]
#[axum::debug_handler]
pub async fn review_queue_dismiss(
  State(state): State<AppState>,
  Json(payload): Json<PendingReviewQueueDismiss>,
) -> Result<Json<PendingReviewQueueActionResult>, AppError> {
  load_pending_review_or_404(payload.conversation_id, payload.item_id, &state.db).await?;

  let consumed = consume_pending_review_item(
    payload.conversation_id,
    payload.item_id,
    Utc::now(),
    &state.db,
  )
  .await?;

  Ok(Json(PendingReviewQueueActionResult {
    ok: consumed,
    item_id: payload.item_id,
    consumed,
    updated_memories: 0,
  }))
}
