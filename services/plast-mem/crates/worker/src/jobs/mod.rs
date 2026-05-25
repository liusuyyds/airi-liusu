mod event_segmentation;
pub use event_segmentation::*;

mod episode_creation;
pub use episode_creation::*;

mod memory_review;
pub use memory_review::*;

mod predict_calibrate;
pub use predict_calibrate::*;

mod review_scheduling;
pub(crate) use review_scheduling::enqueue_pending_reviews;

use plastmem_shared::AppError;

const SPEAKER_ROLE_GUIDE: &str = "\
## Speaker role map
- `user`: the human user who is talking with AIRI.
- `assistant`: AIRI, the assistant/character replying to the human user.
- In a `user` message, first-person words such as \"I\" or \"me\" refer to the human user, and \"you\" refers to AIRI.
- In an `assistant` message, first-person words such as \"I\" or \"me\" refer to AIRI, and \"you\" refers to the human user.
- Roleplay character names mentioned inside message content do not override the message role.
- Attribute requests, blame, care, promises, and actions to the speaker role of the source message unless the text explicitly says someone else did it.
- Never invert emotional direction, blame, care, preferences, promises, or actions between `user` and `assistant`.";

fn speaker_role_guide() -> &'static str {
  SPEAKER_ROLE_GUIDE
}

fn role_label_for_prompt(role: &str) -> String {
  match role.trim().to_ascii_lowercase().as_str() {
    "user" => "user (human user)".to_owned(),
    "assistant" => "assistant (AIRI assistant)".to_owned(),
    _ => role.to_owned(),
  }
}

fn speaker_label_for_prompt(role: &str, name: Option<&str>) -> String {
  let role_label = role_label_for_prompt(role);
  let Some(name) = name.map(str::trim).filter(|name| !name.is_empty()) else {
    return role_label;
  };
  format!("{role_label} named `{name}`")
}

/// Error type for apalis job boundary.
/// Jobs internally use `AppError`; this wrapper converts at the worker boundary.
#[derive(Debug)]
pub struct WorkerError(pub AppError);

impl std::fmt::Display for WorkerError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    self.0.fmt(f)
  }
}

impl std::error::Error for WorkerError {}

impl From<AppError> for WorkerError {
  fn from(err: AppError) -> Self {
    Self(err)
  }
}

// Enable `?` to automatically convert anyhow errors in job functions
impl From<anyhow::Error> for WorkerError {
  fn from(err: anyhow::Error) -> Self {
    Self(AppError::new(err))
  }
}
