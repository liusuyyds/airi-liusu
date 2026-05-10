<script setup lang="ts">
import type { ChatAssistantMessage, ChatHistoryItem, ContextMessage } from '../../../../types/chat'
import type { ChatToolCallRendererRegistry } from './tool-call-renderer'

import { computed, provide, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatAssistantItem from './assistant-item.vue'
import ChatErrorItem from './error-item.vue'
import ChatUserItem from './user-item.vue'

import { useChatHistoryScroll } from '../composables/use-chat-history-scroll'
import { chatScrollContainerKey } from '../constants'
import { getChatHistoryItemKey } from '../utils'

const props = withDefaults(defineProps<{
  messages: ChatHistoryItem[]
  streamingMessage?: ChatAssistantMessage & { createdAt?: number }
  sending?: boolean
  assistantLabel?: string
  userLabel?: string
  errorLabel?: string
  retryLabel?: string
  variant?: 'desktop' | 'mobile'
  toolCallRenderers?: ChatToolCallRendererRegistry
}>(), {
  sending: false,
  variant: 'desktop',
  toolCallRenderers: () => ({}),
})

const emit = defineEmits<{
  (e: 'copyMessage', payload: { message: ChatHistoryItem, index: number, key: string | number }): void
  (e: 'deleteMessage', payload: { message: ChatHistoryItem, index: number, key: string | number }): void
  (e: 'retryMessage', payload: { message: ChatHistoryItem, index: number, key: string | number }): void
}>()

const chatHistoryRef = ref<HTMLDivElement>()
provide(chatScrollContainerKey, chatHistoryRef)

const { t } = useI18n()
const labels = computed(() => ({
  assistant: props.assistantLabel ?? t('stage.chat.message.character-name.airi'),
  user: props.userLabel ?? t('stage.chat.message.character-name.you'),
  error: props.errorLabel ?? t('stage.chat.message.character-name.core-system'),
  retry: props.retryLabel ?? t('stage.chat.actions.retry'),
}))

const streaming = computed<ChatAssistantMessage & { context?: ContextMessage } & { createdAt?: number }>(() => props.streamingMessage ?? { role: 'assistant', content: '', slices: [], tool_results: [], createdAt: Date.now() })
const showStreamingPlaceholder = computed(() => (streaming.value.slices?.length ?? 0) === 0 && !streaming.value.content)
const streamingTs = computed(() => streaming.value?.createdAt)
function shouldShowPlaceholder(message: ChatHistoryItem) {
  const ts = streamingTs.value
  if (ts == null)
    return false

  return message.context?.createdAt === ts || message.createdAt === ts
}

// NOTICE:
// 原先用 `messages.some(...)` 对所有消息做 O(N) 扫描。由于流式消息始终追加
// 在末尾，仅检查最后一条消息是 O(1)，避免流式期间每 24 token 遍历整个数组。
const renderMessages = computed<ChatHistoryItem[]>(() => {
  // NOTICE: 过滤 role: 'tool' 消息——它们产生空的 DOM 容器但仍占 flex gap
  // 间距（gap-2 = 8px），在对话轮次间积累大段空白（如 50 次工具调用 = 400px）。
  const visible = props.messages.filter(m => m.role !== 'tool')

  if (!props.sending)
    return visible

  const streamTs = streamingTs.value
  if (!streamTs)
    return visible

  // NOTICE: 用 visible（已过滤 tool 消息）取最后一条，而非 props.messages。
  // appendSessionMessages 追加 [finalAssistant, tool1, ...] 后，
  // props.messages.at(-1) 是 role: 'tool'，不等于 'assistant'，导致
  // streaming.value 被错误追加为重复消息，工具调用块短暂渲染两次。
  const lastMsg = visible.at(-1)
  if (lastMsg?.role === 'assistant' && lastMsg?.createdAt === streamTs)
    return visible

  return [...visible, streaming.value]
})

useChatHistoryScroll({
  containerRef: chatHistoryRef,
  messages: renderMessages,
  getKey: getChatHistoryItemKey,
})

function emitCopyMessage(message: ChatHistoryItem, index: number) {
  emit('copyMessage', {
    message,
    index,
    key: getChatHistoryItemKey(message, index),
  })
}

function emitDeleteMessage(message: ChatHistoryItem, index: number) {
  // NOTICE: 此处的 index 来自过滤后的 renderMessages（已排除 role: 'tool'）。
  // 通过 findIndex 找回在原始 messages 数组中的真实索引，确保删除操作准确定位。
  const realIndex = props.messages.findIndex(m => m === message)
  emit('deleteMessage', {
    message,
    index: realIndex >= 0 ? realIndex : index,
    key: getChatHistoryItemKey(message, index),
  })
}

function emitRetryMessage(message: ChatHistoryItem, index: number) {
  const realIndex = props.messages.findIndex(m => m === message)
  emit('retryMessage', {
    message,
    index: realIndex >= 0 ? realIndex : index,
    key: getChatHistoryItemKey(message, index),
  })
}
</script>

<template>
  <!-- NOTICE: 移除了 `v-auto-animate`。它会在每次 DOM 变更时对所有子元素执行
       FLIP 动画（getBoundingClientRect），每条新消息产生 O(N) 次布局读取——
       200+ 条消息时性能灾难。滚动合成器已处理滚动到底部。 -->
  <div ref="chatHistoryRef" flex="~ col" relative h-full w-full overflow-y-auto rounded-xl px="<sm:2" py="<sm:2" :class="variant === 'mobile' ? 'gap-1' : 'gap-2'">
    <template v-for="(message, index) in renderMessages" :key="getChatHistoryItemKey(message, index)">
      <div
        :data-chat-message-index="index"
        :data-chat-message-key="String(getChatHistoryItemKey(message, index))"
        :data-chat-message-role="message.role"
      >
        <ChatErrorItem
          v-if="message.role === 'error'"
          :message="message"
          :label="labels.error"
          :retry-label="labels.retry"
          :can-retry="renderMessages[index - 1]?.role === 'user'"
          :show-placeholder="sending && index === renderMessages.length - 1"
          :variant="variant"
          @copy="emitCopyMessage(message, index)"
          @retry="emitRetryMessage(message, index)"
          @delete="emitDeleteMessage(message, index)"
        />
        <ChatAssistantItem
          v-else-if="message.role === 'assistant'"
          :message="message"
          :label="labels.assistant"
          :show-placeholder="shouldShowPlaceholder(message) && showStreamingPlaceholder"
          :variant="variant"
          :tool-call-renderers="toolCallRenderers"
          @copy="emitCopyMessage(message, index)"
          @delete="emitDeleteMessage(message, index)"
        />
        <ChatUserItem
          v-else-if="message.role === 'user'"
          :message="message"
          :label="labels.user"
          :variant="variant"
          @copy="emitCopyMessage(message, index)"
          @delete="emitDeleteMessage(message, index)"
        />
      </div>
    </template>
  </div>
</template>
