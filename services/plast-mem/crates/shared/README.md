# plastmem_shared

Minimal shared types used across the workspace.

## Main exports

### `Message` and `MessageRole`

Conversation payload used by:

- server ingestion APIs
- worker jobs
- episodic storage
- review context

### `AppError`

Shared error boundary used across Rust crates.

### `APP_ENV`

Process-wide environment snapshot with:

- `database_url`
- `openai_chat_base_url`
- `openai_chat_api_key`
- `openai_chat_model`
- `openai_chat_seed`
- `openai_embedding_base_url`
- `openai_embedding_api_key`
- `openai_embedding_model`
- `openai_request_timeout_seconds`
- `enable_fsrs_review`
- `predict_calibrate_concurrency`

## Goal

Keep this crate dependency-light so it can stay at the bottom of the workspace
dependency graph.
