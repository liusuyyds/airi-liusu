use std::collections::HashMap;
use std::env;

use chrono::{DateTime, Utc};
use plastmem_entities::{episodic_memory, pending_review_queue};
use plastmem_shared::AppError;
use sea_orm::{
  ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, DbBackend, EntityTrait,
  QueryFilter, QueryOrder, QuerySelect, Set, Statement, sea_query::Expr,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingReview {
  pub query: String,
  pub memory_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PendingReviewQueueItem {
  pub id: Uuid,
  pub conversation_id: Uuid,
  pub query: String,
  pub memory_ids: Vec<Uuid>,
  pub created_at: DateTime<Utc>,
  pub consumed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone)]
pub struct PendingReviewQueueRetention {
  pub id: Uuid,
  pub memory_ids: Vec<Uuid>,
}

#[derive(Debug, Clone)]
pub struct PendingReviewQueuePlan {
  pub pending_reviews: Vec<PendingReview>,
  pub consumed_item_ids: Vec<Uuid>,
  pub retained_items: Vec<PendingReviewQueueRetention>,
}

#[derive(Debug, Clone, Copy)]
struct ReviewMemoryState {
  last_reviewed_at: DateTime<Utc>,
}

impl PendingReviewQueueItem {
  pub fn from_model(model: pending_review_queue::Model) -> Self {
    Self {
      id: model.id,
      conversation_id: model.conversation_id,
      query: model.query,
      memory_ids: model.memory_ids,
      created_at: model.created_at.with_timezone(&Utc),
      consumed_at: model.consumed_at.map(|dt| dt.with_timezone(&Utc)),
    }
  }

  pub fn to_model(&self) -> pending_review_queue::Model {
    pending_review_queue::Model {
      id: self.id,
      conversation_id: self.conversation_id,
      query: self.query.clone(),
      memory_ids: self.memory_ids.clone(),
      created_at: self.created_at.into(),
      consumed_at: self.consumed_at.map(Into::into),
    }
  }
}

pub async fn add_pending_review_item(
  conversation_id: Uuid,
  memory_ids: Vec<Uuid>,
  query: String,
  db: &DatabaseConnection,
) -> Result<(), AppError> {
  pending_review_queue::ActiveModel {
    id: Set(Uuid::now_v7()),
    conversation_id: Set(conversation_id),
    query: Set(query),
    memory_ids: Set(memory_ids),
    created_at: Set(Utc::now().into()),
    consumed_at: Set(None),
  }
  .insert(db)
  .await?;

  Ok(())
}

pub async fn list_pending_review_conversation_ids(
  db: &DatabaseConnection,
) -> Result<Vec<Uuid>, AppError> {
  let rows = db
    .query_all_raw(Statement::from_string(
      DbBackend::Postgres,
      "SELECT DISTINCT conversation_id FROM pending_review_queue WHERE consumed_at IS NULL"
        .to_owned(),
    ))
    .await?;

  rows
    .into_iter()
    .map(|row| row.try_get("", "conversation_id").map_err(AppError::from))
    .collect()
}

pub async fn list_pending_review_items<C>(
  conversation_id: Uuid,
  limit: u64,
  db: &C,
) -> Result<Vec<PendingReviewQueueItem>, AppError>
where
  C: ConnectionTrait,
{
  let models = pending_review_queue::Entity::find()
    .filter(pending_review_queue::Column::ConversationId.eq(conversation_id))
    .filter(pending_review_queue::Column::ConsumedAt.is_null())
    .order_by_asc(pending_review_queue::Column::CreatedAt)
    .limit(limit)
    .all(db)
    .await?;

  Ok(
    models
      .into_iter()
      .map(PendingReviewQueueItem::from_model)
      .collect(),
  )
}

pub async fn get_pending_review_item<C>(
  conversation_id: Uuid,
  item_id: Uuid,
  db: &C,
) -> Result<Option<PendingReviewQueueItem>, AppError>
where
  C: ConnectionTrait,
{
  let model = pending_review_queue::Entity::find()
    .filter(pending_review_queue::Column::ConversationId.eq(conversation_id))
    .filter(pending_review_queue::Column::Id.eq(item_id))
    .filter(pending_review_queue::Column::ConsumedAt.is_null())
    .one(db)
    .await?;

  Ok(model.map(PendingReviewQueueItem::from_model))
}

pub async fn update_pending_review_item_query<C>(
  conversation_id: Uuid,
  item_id: Uuid,
  query: String,
  db: &C,
) -> Result<Option<PendingReviewQueueItem>, AppError>
where
  C: ConnectionTrait,
{
  let Some(model) = pending_review_queue::Entity::find()
    .filter(pending_review_queue::Column::ConversationId.eq(conversation_id))
    .filter(pending_review_queue::Column::Id.eq(item_id))
    .filter(pending_review_queue::Column::ConsumedAt.is_null())
    .one(db)
    .await?
  else {
    return Ok(None);
  };

  let mut active: pending_review_queue::ActiveModel = model.into();
  active.query = Set(query);

  Ok(Some(PendingReviewQueueItem::from_model(
    active.update(db).await?,
  )))
}

pub async fn consume_pending_review_item<C>(
  conversation_id: Uuid,
  item_id: Uuid,
  consumed_at: DateTime<Utc>,
  db: &C,
) -> Result<bool, AppError>
where
  C: ConnectionTrait,
{
  let result = pending_review_queue::Entity::update_many()
    .col_expr(
      pending_review_queue::Column::ConsumedAt,
      Expr::value(consumed_at),
    )
    .filter(pending_review_queue::Column::ConversationId.eq(conversation_id))
    .filter(pending_review_queue::Column::Id.eq(item_id))
    .filter(pending_review_queue::Column::ConsumedAt.is_null())
    .exec(db)
    .await?;

  Ok(result.rows_affected > 0)
}

pub async fn plan_pending_review_items_for_update<C>(
  conversation_id: Uuid,
  reviewed_at: DateTime<Utc>,
  db: &C,
) -> Result<Option<PendingReviewQueuePlan>, AppError>
where
  C: ConnectionTrait,
{
  let models = pending_review_queue::Entity::find()
    .filter(pending_review_queue::Column::ConversationId.eq(conversation_id))
    .filter(pending_review_queue::Column::ConsumedAt.is_null())
    .order_by_asc(pending_review_queue::Column::CreatedAt)
    .lock_exclusive()
    .all(db)
    .await?;

  if models.is_empty() {
    return Ok(None);
  }

  let memory_ids = models
    .iter()
    .flat_map(|model| model.memory_ids.iter().copied())
    .collect::<Vec<_>>();
  let memory_states = load_review_memory_states(memory_ids, db).await?;
  let plan = build_pending_review_queue_plan(models, &memory_states, reviewed_at);

  if plan.pending_reviews.is_empty()
    && plan.consumed_item_ids.is_empty()
    && plan.retained_items.is_empty()
  {
    return Ok(None);
  }

  Ok(Some(plan))
}

pub async fn apply_pending_review_queue_plan<C>(
  plan: &PendingReviewQueuePlan,
  db: &C,
) -> Result<(), AppError>
where
  C: ConnectionTrait,
{
  for retained_item in &plan.retained_items {
    pending_review_queue::ActiveModel {
      id: Set(retained_item.id),
      memory_ids: Set(retained_item.memory_ids.clone()),
      ..Default::default()
    }
    .update(db)
    .await?;
  }

  if !plan.consumed_item_ids.is_empty() {
    let consumed_at = Utc::now();

    pending_review_queue::Entity::update_many()
      .col_expr(
        pending_review_queue::Column::ConsumedAt,
        Expr::value(consumed_at),
      )
      .filter(pending_review_queue::Column::Id.is_in(plan.consumed_item_ids.clone()))
      .exec(db)
      .await?;
  }

  Ok(())
}

async fn load_review_memory_states<C>(
  memory_ids: Vec<Uuid>,
  db: &C,
) -> Result<HashMap<Uuid, ReviewMemoryState>, AppError>
where
  C: ConnectionTrait,
{
  if memory_ids.is_empty() {
    return Ok(HashMap::new());
  }

  let models = episodic_memory::Entity::find()
    .filter(episodic_memory::Column::Id.is_in(memory_ids))
    .all(db)
    .await?;

  Ok(
    models
      .into_iter()
      .map(|model| {
        (
          model.id,
          ReviewMemoryState {
            last_reviewed_at: model.last_reviewed_at.with_timezone(&Utc),
          },
        )
      })
      .collect(),
  )
}

fn build_pending_review_queue_plan(
  models: Vec<pending_review_queue::Model>,
  memory_states: &HashMap<Uuid, ReviewMemoryState>,
  reviewed_at: DateTime<Utc>,
) -> PendingReviewQueuePlan {
  let review_window_hours = resolve_review_window_hours();
  let mut pending_reviews = Vec::new();
  let mut consumed_item_ids = Vec::new();
  let mut retained_items = Vec::new();

  for model in models {
    let original_memory_count = model.memory_ids.len();
    let mut due_memory_ids = Vec::new();
    let mut deferred_memory_ids = Vec::new();

    for memory_id in model.memory_ids {
      let Some(memory_state) = memory_states.get(&memory_id) else {
        continue;
      };

      if is_review_due(memory_state.last_reviewed_at, reviewed_at, review_window_hours) {
        due_memory_ids.push(memory_id);
      } else {
        deferred_memory_ids.push(memory_id);
      }
    }

    if !due_memory_ids.is_empty() {
      pending_reviews.push(PendingReview {
        query: model.query.clone(),
        memory_ids: due_memory_ids,
      });
    }

    if deferred_memory_ids.is_empty() {
      consumed_item_ids.push(model.id);
    } else if deferred_memory_ids.len() != original_memory_count {
      retained_items.push(PendingReviewQueueRetention {
        id: model.id,
        memory_ids: deferred_memory_ids,
      });
    }
  }

  PendingReviewQueuePlan {
    pending_reviews,
    consumed_item_ids,
    retained_items,
  }
}

fn resolve_review_window_hours() -> i64 {
  env::var("PLAST_MEM_REVIEW_WINDOW_HOURS")
    .ok()
    .and_then(|value| value.trim().parse::<i64>().ok())
    .filter(|hours| *hours > 0)
    .unwrap_or(24)
}

fn is_review_due(
  last_reviewed_at: DateTime<Utc>,
  reviewed_at: DateTime<Utc>,
  review_window_hours: i64,
) -> bool {
  reviewed_at > last_reviewed_at
    && (reviewed_at - last_reviewed_at).num_hours() >= review_window_hours.max(1)
}

#[cfg(test)]
mod tests {
  use chrono::{Duration, TimeZone};

  use super::*;

  fn timestamp(day: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 5, day, 12, 0, 0).unwrap()
  }

  fn model(id: Uuid, query: &str, memory_ids: Vec<Uuid>) -> pending_review_queue::Model {
    pending_review_queue::Model {
      id,
      conversation_id: Uuid::nil(),
      query: query.to_owned(),
      memory_ids,
      created_at: timestamp(25).into(),
      consumed_at: None,
    }
  }

  /**
   * @example
   * let plan = build_pending_review_queue_plan(models, &states, reviewed_at);
   * assert_eq!(plan.pending_reviews[0].memory_ids, vec![due_id]);
   */
  #[test]
  fn pending_review_plan_splits_due_and_deferred_memories() {
    let due_id = Uuid::now_v7();
    let deferred_id = Uuid::now_v7();
    let item_id = Uuid::now_v7();
    let reviewed_at = timestamp(25);
    let memory_states = HashMap::from([
      (
        due_id,
        ReviewMemoryState {
          last_reviewed_at: reviewed_at - Duration::days(2),
        },
      ),
      (
        deferred_id,
        ReviewMemoryState {
          last_reviewed_at: reviewed_at,
        },
      ),
    ]);

    let plan = build_pending_review_queue_plan(
      vec![model(item_id, "query", vec![due_id, deferred_id])],
      &memory_states,
      reviewed_at,
    );

    assert_eq!(plan.pending_reviews.len(), 1);
    assert_eq!(plan.pending_reviews[0].memory_ids, vec![due_id]);
    assert_eq!(plan.retained_items.len(), 1);
    assert_eq!(plan.retained_items[0].id, item_id);
    assert_eq!(plan.retained_items[0].memory_ids, vec![deferred_id]);
    assert!(plan.consumed_item_ids.is_empty());
  }

  /**
   * @example
   * let plan = build_pending_review_queue_plan(models, &HashMap::new(), reviewed_at);
   * assert_eq!(plan.consumed_item_ids, vec![item_id]);
   */
  #[test]
  fn pending_review_plan_consumes_items_when_memories_are_gone() {
    let item_id = Uuid::now_v7();

    let plan = build_pending_review_queue_plan(
      vec![model(item_id, "query", vec![Uuid::now_v7()])],
      &HashMap::new(),
      timestamp(25),
    );

    assert!(plan.pending_reviews.is_empty());
    assert!(plan.retained_items.is_empty());
    assert_eq!(plan.consumed_item_ids, vec![item_id]);
  }

  /**
   * @example
   * let due = is_review_due(last_reviewed_at, reviewed_at);
   * assert!(!due);
   */
  #[test]
  fn review_due_requires_at_least_one_elapsed_day() {
    let last_reviewed_at = timestamp(25);

    assert!(!is_review_due(
      last_reviewed_at,
      last_reviewed_at + Duration::hours(23),
      24,
    ));
    assert!(is_review_due(
      last_reviewed_at,
      last_reviewed_at + Duration::hours(24),
      24,
    ));
  }
}
