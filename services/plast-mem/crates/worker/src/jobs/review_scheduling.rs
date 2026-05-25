use apalis::prelude::TaskSink;
use apalis_postgres::PostgresStorage;
use chrono::Utc;
use plastmem_core::{apply_pending_review_queue_plan, plan_pending_review_items_for_update};
use plastmem_shared::{APP_ENV, AppError, Message};
use sea_orm::TransactionTrait;
use uuid::Uuid;

use super::MemoryReviewJob;

pub(crate) async fn enqueue_pending_reviews(
  conversation_id: Uuid,
  context_messages: &[Message],
  db: &sea_orm::DatabaseConnection,
  review_storage: &PostgresStorage<MemoryReviewJob>,
) -> Result<(), AppError> {
  if !APP_ENV.enable_fsrs_review {
    return Ok(());
  }

  let reviewed_at = Utc::now();
  let txn = db.begin().await?;
  if let Some(plan) =
    plan_pending_review_items_for_update(conversation_id, reviewed_at, &txn).await?
  {
    if plan.pending_reviews.is_empty() {
      apply_pending_review_queue_plan(&plan, &txn).await?;
      txn.commit().await?;
      return Ok(());
    }

    let review_job = MemoryReviewJob {
      pending_reviews: plan.pending_reviews.clone(),
      context_messages: context_messages.to_vec(),
      reviewed_at,
    };
    let mut storage = review_storage.clone();
    storage.push(review_job).await?;
    apply_pending_review_queue_plan(&plan, &txn).await?;
  }

  txn.commit().await?;

  Ok(())
}
