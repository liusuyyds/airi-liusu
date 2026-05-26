use std::env;

use chrono::{DateTime, Utc};

const DEFAULT_REVIEW_WINDOW_HOURS: i64 = 24;

pub fn resolve_review_window_hours() -> i64 {
  env::var("PLAST_MEM_REVIEW_WINDOW_HOURS")
    .ok()
    .and_then(|value| value.trim().parse::<i64>().ok())
    .filter(|hours| *hours > 0)
    .unwrap_or(DEFAULT_REVIEW_WINDOW_HOURS)
}

pub fn is_review_due(
  last_reviewed_at: DateTime<Utc>,
  reviewed_at: DateTime<Utc>,
  review_window_hours: i64,
) -> bool {
  reviewed_at > last_reviewed_at
    && (reviewed_at - last_reviewed_at).num_hours() >= review_window_hours.max(1)
}
