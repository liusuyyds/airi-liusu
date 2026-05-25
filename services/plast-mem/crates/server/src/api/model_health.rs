use axum::Json;
use plastmem_ai::{
  ChatCompletionRequestMessage, ChatCompletionRequestSystemMessage, embed, generate_object,
};
use plastmem_shared::AppError;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Deserialize, JsonSchema)]
struct ModelHealthChatProbe {
  ok: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ModelProviderHealth {
  pub ok: bool,
  pub error: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ModelHealthResult {
  pub chat: ModelProviderHealth,
  pub embedding: ModelProviderHealth,
}

async fn check_chat_model() -> ModelProviderHealth {
  let messages = vec![ChatCompletionRequestMessage::System(
    ChatCompletionRequestSystemMessage::from("Return a JSON object with ok set to true."),
  )];

  match generate_object::<ModelHealthChatProbe>(
    messages,
    "plast_mem_model_health".to_owned(),
    Some(
      "Check whether the configured chat model supports Plast Mem structured output.".to_owned(),
    ),
  )
  .await
  {
    Ok(result) => ModelProviderHealth {
      ok: result.ok,
      error: (!result.ok).then(|| "chat model returned ok=false".to_owned()),
    },
    Err(error) => ModelProviderHealth {
      ok: false,
      error: Some(error.to_string()),
    },
  }
}

async fn check_embedding_model() -> ModelProviderHealth {
  match embed("plast mem model health check").await {
    Ok(_) => ModelProviderHealth {
      ok: true,
      error: None,
    },
    Err(error) => ModelProviderHealth {
      ok: false,
      error: Some(error.to_string()),
    },
  }
}

/// Check configured chat and embedding model providers.
#[utoipa::path(
  post,
  path = "/api/v0/model_health",
  responses(
    (status = 200, description = "Configured model provider health", body = ModelHealthResult),
  )
)]
#[axum::debug_handler]
pub async fn model_health() -> Result<Json<ModelHealthResult>, AppError> {
  let (chat, embedding) = tokio::join!(check_chat_model(), check_embedding_model());

  Ok(Json(ModelHealthResult { chat, embedding }))
}
