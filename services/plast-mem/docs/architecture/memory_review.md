# Memory Review

Memory review is the FSRS update path for episodic memories.

It is decoupled from retrieval and from segmentation policy.

## Flow

```text
retrieve_memory / retrieve_memory_raw
  -> add_pending_review_item(conversation_id, memory_ids, query)

Later, after segmentation commit:
  -> begin DB transaction
  -> plan_pending_review_items_for_update(conversation_id, reviewed_at)
  -> enqueue MemoryReviewJob
  -> apply_pending_review_queue_plan(...)
  -> commit DB transaction

Or, if no new segmentation commit happens:
  -> periodic worker sweep
  -> begin DB transaction
  -> plan_pending_review_items_for_update(conversation_id, reviewed_at)
  -> enqueue MemoryReviewJob with recent conversation messages
  -> apply_pending_review_queue_plan(...)
  -> commit DB transaction

MemoryReviewJob
  -> aggregate memory ids and matched queries
  -> load episodic records
  -> skip stale / same-day reviews
  -> ask review LLM for ratings
  -> apply FSRS next_states update
```

## Storage

Pending review items now live in the dedicated `pending_review_queue` table.

They no longer live inside a `message_queue` row.

The queue uses at-least-once scheduling semantics:

- eligible memory IDs are planned first
- the review job is pushed before queue rows are consumed or trimmed
- planning uses row locks held until the queue update commits
- memory IDs that are not old enough for review remain unconsumed
- missing/deleted memory IDs are removed from the pending queue

This means a failed job enqueue can retry later without losing the review item.

## Rating model

The LLM emits one rating per memory:

- `again`
- `hard`
- `good`
- `easy`

The worker maps that to FSRS next states using the current `stability`,
`difficulty`, and days since the last review.

## Current guards

Before applying an update, the worker skips a memory when:

- the record no longer exists
- `job.reviewed_at <= last_reviewed_at`
- fewer than 1 day has elapsed since `last_reviewed_at`

The scheduler also avoids enqueueing same-day memory IDs. If a pending queue row
contains both due and not-yet-due memories, the due IDs are enqueued and the
remaining IDs stay pending for a later review pass.

## Code

- `crates/server/src/api/retrieve_memory.rs`
- `crates/core/src/pending_review_queue.rs`
- `crates/worker/src/jobs/event_segmentation.rs`
- `crates/worker/src/jobs/memory_review.rs`
