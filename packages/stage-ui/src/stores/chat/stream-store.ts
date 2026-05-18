import type { StreamingAssistantMessage } from '../../types/chat'

import { defineStore } from 'pinia'
import { ref, shallowRef, toRaw } from 'vue'

import { useLocalStorageManualReset } from '../../../../stage-shared/src/composables/use-local-storage-manual-reset'
import { useChatSessionStore } from './session-store'

export const useChatStreamStore = defineStore('chat-stream', () => {
  const chatSession = useChatSessionStore()
  const contextTokenCount = ref(0)
  const completionTokenCount = ref(0)
  const totalTokensConsumed = useLocalStorageManualReset<number>('chat/total-tokens-consumed', 0)
  // NOTICE:
  // shallowRef avoids wrapping the streaming message in a deep reactive proxy.
  // The main streaming path (chat.ts orchestrator) reassigns `.value` entirely
  // via `updateUI()` → `streamingMessage.value = cloneStreamingMessage(...)`,
  // which is the trigger point for shallowRef reactivity. In-place mutations
  // (appendStreamLiteral) are only used by secondary consumers and do not need
  // deep tracking — they are followed by explicit `.value` reassignment.
  const streamingMessage = shallowRef<StreamingAssistantMessage>({ role: 'assistant', content: '', slices: [], tool_results: [], tool_calls: [], createdAt: Date.now() })

  function beginStream() {
    streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [], tool_calls: [], createdAt: Date.now() }
  }

  function appendStreamLiteral(literal: string) {
    const current = streamingMessage.value
    const slices = [...current.slices]
    const lastSlice = slices.at(-1)

    if (lastSlice?.type === 'text') {
      slices[slices.length - 1] = {
        ...lastSlice,
        text: lastSlice.text + literal,
      }
    }
    else {
      slices.push({
        type: 'text',
        text: literal,
      })
    }

    streamingMessage.value = {
      ...current,
      content: current.content + literal,
      slices,
    }
  }

  function finalizeStream(fullText?: string) {
    const sessionId = chatSession.activeSessionId
    if (streamingMessage.value.slices.length > 0)
      chatSession.appendSessionMessage(sessionId, toRaw(streamingMessage.value))
    streamingMessage.value = { role: 'assistant', content: fullText ?? '', slices: [], tool_results: [], tool_calls: [] }
  }

  function resetStream() {
    streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [], tool_calls: [] }
  }

  /**
   * Accumulates prompt + completion tokens into the running lifetime total.
   * Call once per successful stream after the provider reports usage.
   */
  function accumulateTokens(promptTokens: number, completionTokens: number) {
    totalTokensConsumed.value += promptTokens + completionTokens
  }

  /**
   * Resets the lifetime token counter. Use when the user clears chat history
   * to start a fresh accounting session.
   */
  function resetTotalTokens() {
    totalTokensConsumed.value = 0
  }

  return {
    streamingMessage,
    contextTokenCount,
    completionTokenCount,
    totalTokensConsumed,
    beginStream,
    appendStreamLiteral,
    finalizeStream,
    resetStream,
    accumulateTokens,
    resetTotalTokens,
  }
})
