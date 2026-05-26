use axum::{Json, Router, routing::get};
use utoipa::OpenApi;
use utoipa_axum::{router::OpenApiRouter, routes};
use utoipa_scalar::{Scalar, Servable};

use crate::utils::AppState;

mod add_message;
#[cfg(debug_assertions)]
mod benchmark;
mod health;
mod model_health;
mod recent_memory;
mod retrieve_memory;
mod review_queue;
mod semantic_memory;

pub use add_message::{
  IngestMessageResult, InputConversationMessage, InputConversationMessages, InputMessage,
};
#[cfg(debug_assertions)]
pub use benchmark::BenchmarkJobStatus;
pub use health::{
  ConversationMessageUpdate, ConversationMessageView, ConversationMessagesList,
  EpisodeSpanView, EpisodeSpansList, EpisodicMemoryUpdate, HealthCheck, HealthCheckResult,
  HealthCounts,
};
pub use model_health::{ModelHealthResult, ModelProviderHealth};
pub use recent_memory::RecentMemory;
pub use retrieve_memory::{
  ContextPreRetrieve, EpisodicMemoryResult, RetrieveMemory, RetrieveMemoryRawResult,
  SemanticMemoryResult,
};
pub use review_queue::{
  PendingReviewQueueActionResult, PendingReviewQueueApprove, PendingReviewQueueDismiss,
  PendingReviewQueueItemView, PendingReviewQueueList, PendingReviewQueueMemory,
  PendingReviewQueueStatus,
  PendingReviewQueueRewrite, PendingReviewQueueUpdateMemory,
};
pub use semantic_memory::{
  SemanticMemoryDelete, SemanticMemoryList, SemanticMemorySetInvalid, SemanticMemoryUpdate,
};

pub fn app() -> Router<AppState> {
  let router = OpenApiRouter::with_openapi(ApiDoc::openapi())
    .routes(routes!(add_message::add_message))
    .routes(routes!(add_message::import_batch_messages))
    .routes(routes!(health::health))
    .routes(routes!(health::conversation_messages_raw))
    .routes(routes!(health::conversation_message_update))
    .routes(routes!(health::episode_spans_raw))
    .routes(routes!(health::episodic_memory_update))
    .routes(routes!(model_health::model_health))
    .routes(routes!(recent_memory::recent_memory))
    .routes(routes!(recent_memory::recent_memory_raw))
    .routes(routes!(review_queue::review_queue_raw))
    .routes(routes!(review_queue::review_queue_rewrite))
    .routes(routes!(review_queue::review_queue_update_memory))
    .routes(routes!(review_queue::review_queue_approve))
    .routes(routes!(review_queue::review_queue_dismiss))
    .routes(routes!(retrieve_memory::retrieve_memory))
    .routes(routes!(retrieve_memory::retrieve_memory_raw))
    .routes(routes!(retrieve_memory::context_pre_retrieve))
    .routes(routes!(semantic_memory::semantic_memory_raw))
    .routes(routes!(semantic_memory::semantic_memory_set_invalid))
    .routes(routes!(semantic_memory::semantic_memory_update))
    .routes(routes!(semantic_memory::semantic_memory_delete));

  #[cfg(debug_assertions)]
  let router = router.routes(routes!(benchmark::benchmark_job_status));

  let (router, openapi) = router.split_for_parts();

  let openapi_json = openapi.clone();

  router
    .route(
      "/openapi.json",
      get(move || async move { Json(openapi_json) }),
    )
    .merge(Scalar::with_url("/openapi/", openapi))
}

#[cfg(debug_assertions)]
#[derive(OpenApi)]
#[openapi(
  info(title = "Plast Mem"),
  components(schemas(
    InputMessage,
    InputConversationMessage,
    InputConversationMessages,
    IngestMessageResult,
    HealthCheck,
    HealthCheckResult,
    HealthCounts,
    ConversationMessagesList,
    ConversationMessageView,
    ConversationMessageUpdate,
    EpisodeSpansList,
    EpisodeSpanView,
    EpisodicMemoryUpdate,
    ModelHealthResult,
    ModelProviderHealth,
    BenchmarkJobStatus,
    RecentMemory,
    PendingReviewQueueMemory,
    PendingReviewQueueItemView,
    PendingReviewQueueList,
    PendingReviewQueueStatus,
    PendingReviewQueueRewrite,
    PendingReviewQueueUpdateMemory,
    PendingReviewQueueApprove,
    PendingReviewQueueDismiss,
    PendingReviewQueueActionResult,
    SemanticMemoryList,
    SemanticMemorySetInvalid,
    SemanticMemoryUpdate,
    SemanticMemoryDelete,
    RetrieveMemory,
    ContextPreRetrieve,
    RetrieveMemoryRawResult,
    EpisodicMemoryResult,
    SemanticMemoryResult,
    plastmem_core::EpisodicMemory,
    plastmem_core::SemanticMemory,
    plastmem_core::DetailLevel,
    plastmem_shared::Message,
    plastmem_shared::MessageRole,
  ))
)]
pub struct ApiDoc;

#[cfg(not(debug_assertions))]
#[derive(OpenApi)]
#[openapi(
  info(title = "Plast Mem"),
  components(schemas(
    InputMessage,
    InputConversationMessage,
    InputConversationMessages,
    IngestMessageResult,
    HealthCheck,
    HealthCheckResult,
    HealthCounts,
    ConversationMessagesList,
    ConversationMessageView,
    ConversationMessageUpdate,
    EpisodeSpansList,
    EpisodeSpanView,
    EpisodicMemoryUpdate,
    ModelHealthResult,
    ModelProviderHealth,
    RecentMemory,
    PendingReviewQueueMemory,
    PendingReviewQueueItemView,
    PendingReviewQueueList,
    PendingReviewQueueStatus,
    PendingReviewQueueRewrite,
    PendingReviewQueueUpdateMemory,
    PendingReviewQueueApprove,
    PendingReviewQueueDismiss,
    PendingReviewQueueActionResult,
    SemanticMemoryList,
    SemanticMemorySetInvalid,
    SemanticMemoryUpdate,
    SemanticMemoryDelete,
    RetrieveMemory,
    ContextPreRetrieve,
    RetrieveMemoryRawResult,
    EpisodicMemoryResult,
    SemanticMemoryResult,
    plastmem_core::EpisodicMemory,
    plastmem_core::SemanticMemory,
    plastmem_core::DetailLevel,
    plastmem_shared::Message,
    plastmem_shared::MessageRole,
  ))
)]
pub struct ApiDoc;
