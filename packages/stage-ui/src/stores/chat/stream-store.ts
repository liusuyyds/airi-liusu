import type { StreamingAssistantMessage } from '../../types/chat'

import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'

import { useLocalStorageManualReset } from '../../../../stage-shared/src/composables/use-local-storage-manual-reset'
import { useChatSessionStore } from './session-store'

export const useChatStreamStore = defineStore('chat-stream', () => {
  const chatSession = useChatSessionStore()
  const contextTokenCount = ref(0)
  const completionTokenCount = ref(0)
  const totalTokensConsumed = useLocalStorageManualReset<number>('chat/total-tokens-consumed', 0)
  const streamingMessage = ref<StreamingAssistantMessage>({ role: 'assistant', content: '', slices: [], tool_results: [], tool_calls: [], createdAt: Date.now() })

  function beginStream() {
    streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [], tool_calls: [], createdAt: Date.now() }
  }

  function appendStreamLiteral(literal: string) {
    streamingMessage.value.content += literal

    const lastSlice = streamingMessage.value.slices.at(-1)
    if (lastSlice?.type === 'text') {
      lastSlice.text += literal
      return
    }

    streamingMessage.value.slices.push({
      type: 'text',
      text: literal,
    })
  }

  function finalizeStream(fullText?: string) {
    const sessionId = chatSession.activeSessionId
    if (streamingMessage.value.slices.length > 0)
      chatSession.appendSessionMessage(sessionId, toRaw(streamingMessage.value))
    streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [], tool_calls: [] }
    if (fullText)
      streamingMessage.value.content = fullText
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
