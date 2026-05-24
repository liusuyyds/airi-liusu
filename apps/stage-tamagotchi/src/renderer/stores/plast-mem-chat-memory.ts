import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'

import type { ElectronPlastMemChatMessage } from '../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatContextStore } from '@proj-airi/stage-ui/stores/chat/context-store'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import {
  electronPlastMemAcquireChatBridge,
  electronPlastMemContextPreRetrieve,
  electronPlastMemHealth,
  electronPlastMemIngestChatMessages,
  electronPlastMemRecentMemory,
  electronPlastMemReleaseChatBridge,
  electronPlastMemRetrieveChatContext,
} from '../../shared/eventa'

const PLAST_MEM_CHAT_CONTEXT_ID = 'plast-mem:chat-recall'
const PLAST_MEM_PRE_RETRIEVE_CONTEXT_ID = 'plast-mem:pre-retrieve'
const PLAST_MEM_RECENT_MEMORY_CONTEXT_ID = 'plast-mem:recent-memory'
const PLAST_MEM_OWNER_ID_STORAGE_KEY = 'plast-mem:chat-memory-owner-id'
const RECENT_HOOK_SIGNATURE_TTL_MSEC = 30_000
type RecallStatus = 'idle' | 'recalled' | 'empty' | 'error'
type IngestStatus = 'idle' | 'accepted' | 'rejected' | 'error'

const recentHookSignatures = new Map<string, number>()

function createOwnerId() {
  return globalThis.crypto?.randomUUID?.() ?? `plast-mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function resolveOwnerId() {
  try {
    const cached = globalThis.sessionStorage?.getItem(PLAST_MEM_OWNER_ID_STORAGE_KEY)?.trim()
    if (cached)
      return cached

    const nextOwnerId = createOwnerId()
    globalThis.sessionStorage?.setItem(PLAST_MEM_OWNER_ID_STORAGE_KEY, nextOwnerId)
    return nextOwnerId
  }
  catch {
    return createOwnerId()
  }
}

const ownerId = resolveOwnerId()

function textFromContent(content: ChatHistoryItem['content'] | undefined) {
  if (typeof content === 'string')
    return content.trim()

  if (!Array.isArray(content))
    return ''

  return content
    .map((part) => {
      if (part?.type !== 'text')
        return ''

      return typeof part.text === 'string' ? part.text : ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function createChatMemoryContext(contextId: string, text: string) {
  return {
    id: `plast-mem-chat-${Date.now().toString(36)}`,
    contextId,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text,
    createdAt: Date.now(),
    metadata: {
      source: {
        id: contextId,
        kind: 'plugin' as const,
        plugin: {
          id: 'plast-mem',
        },
      },
    },
  }
}

function pruneRecentHookSignatures(now: number) {
  for (const [signature, claimedAt] of recentHookSignatures) {
    if (now - claimedAt > RECENT_HOOK_SIGNATURE_TTL_MSEC)
      recentHookSignatures.delete(signature)
  }
}

function claimRecentHookSignature(signature: string) {
  const now = Date.now()
  pruneRecentHookSignatures(now)
  if (recentHookSignatures.has(signature))
    return false

  recentHookSignatures.set(signature, now)
  return true
}

function turnKeyFromContext(context: { message?: { createdAt?: number, id?: string } }, fallback: string) {
  return context.message?.id ?? `${context.message?.createdAt ?? 0}:${fallback}`
}

export const usePlastMemChatMemoryStore = defineStore('stage-tamagotchi:plast-mem-chat-memory', () => {
  const chatOrchestrator = useChatOrchestratorStore()
  const chatContext = useChatContextStore()
  const acquireChatBridge = useElectronEventaInvoke(electronPlastMemAcquireChatBridge)
  const retrieveChatContext = useElectronEventaInvoke(electronPlastMemRetrieveChatContext)
  const contextPreRetrieve = useElectronEventaInvoke(electronPlastMemContextPreRetrieve)
  const recentMemory = useElectronEventaInvoke(electronPlastMemRecentMemory)
  const ingestChatMessages = useElectronEventaInvoke(electronPlastMemIngestChatMessages)
  const releaseChatBridge = useElectronEventaInvoke(electronPlastMemReleaseChatBridge)
  const checkHealth = useElectronEventaInvoke(electronPlastMemHealth)
  const lastRecallError = ref<string>()
  const lastRecallAt = ref<number>()
  const lastRecallContextBlock = ref('')
  const lastRecallContextCharacters = ref(0)
  const lastRecallStatus = ref<RecallStatus>('idle')
  const lastIngestError = ref<string>()
  const lastIngestAt = ref<number>()
  const lastIngestMessageCount = ref(0)
  const lastIngestStatus = ref<IngestStatus>('idle')
  const lastHealthCheckAt = ref<number>()
  const lastHealthCheckOk = ref<boolean>()
  const disposeFns = ref<Array<() => void>>([])
  const initializing = ref(false)
  const leaseAcquired = ref(false)
  const recentMemoryRecalled = ref(false)
  let healthCheckTimer: ReturnType<typeof setInterval> | undefined
  const HEALTH_CHECK_INTERVAL_MSEC = 5 * 60 * 1000

  async function performHealthCheck() {
    try {
      const result = await checkHealth({})
      lastHealthCheckAt.value = Date.now()
      lastHealthCheckOk.value = !result.error && result.databaseOk !== false
    }
    catch (error) {
      lastHealthCheckAt.value = Date.now()
      lastHealthCheckOk.value = false
      console.warn('[plast-mem-chat-memory] health check failed:', errorMessageFrom(error) ?? String(error))
    }
  }

  async function initialize() {
    if (initializing.value || disposeFns.value.length > 0)
      return

    initializing.value = true
    let lease: Awaited<ReturnType<typeof acquireChatBridge>>
    try {
      lease = await acquireChatBridge({ ownerId })
    }
    catch (error) {
      initializing.value = false
      console.warn('[plast-mem-chat-memory] failed to acquire chat bridge lease:', errorMessageFrom(error) ?? String(error))
      return
    }

    initializing.value = false
    if (!lease.acquired)
      return

    leaseAcquired.value = true

    void performHealthCheck()
    healthCheckTimer = setInterval(() => {
      void performHealthCheck()
    }, HEALTH_CHECK_INTERVAL_MSEC)

    disposeFns.value.push(
      chatOrchestrator.onBeforeMessageComposed(async (message, context) => {
        const query = message.trim()
        const recallSignature = `recall:${turnKeyFromContext(context, query)}:${query}`
        if (!claimRecentHookSignature(recallSignature))
          return

        const preRetrieveSignature = `pre-retrieve:${turnKeyFromContext(context, query)}:${query}`
        const shouldPreRetrieve = claimRecentHookSignature(preRetrieveSignature)

        const recallPromise = retrieveChatContext({
          ownerId,
          query,
          detail: 'low',
        })
        const preRetrievePromise = shouldPreRetrieve
          ? contextPreRetrieve({
              ownerId,
              query,
              detail: 'low',
            })
          : Promise.resolve(undefined)

        const [recallResult, preRetrieveResult] = await Promise.all([recallPromise, preRetrievePromise])

        if (recallResult.error) {
          lastRecallAt.value = Date.now()
          lastRecallContextBlock.value = ''
          lastRecallContextCharacters.value = 0
          lastRecallError.value = recallResult.error
          lastRecallStatus.value = 'error'
          console.warn('[plast-mem-chat-memory] failed to recall chat memory:', recallResult.error)
        }
        else {
          lastRecallAt.value = Date.now()
          lastRecallError.value = undefined
          if (!recallResult.contextBlock) {
            lastRecallContextBlock.value = ''
            lastRecallContextCharacters.value = 0
            lastRecallStatus.value = 'empty'
          }
          else {
            lastRecallContextBlock.value = recallResult.contextBlock
            lastRecallContextCharacters.value = recallResult.contextBlock.length
            lastRecallStatus.value = 'recalled'
            chatContext.ingestContextMessage(createChatMemoryContext(
              PLAST_MEM_CHAT_CONTEXT_ID,
              recallResult.contextBlock,
            ))
          }
        }

        if (preRetrieveResult?.contextBlock) {
          chatContext.ingestContextMessage(createChatMemoryContext(
            PLAST_MEM_PRE_RETRIEVE_CONTEXT_ID,
            preRetrieveResult.contextBlock,
          ))
        }

        if (!recentMemoryRecalled.value) {
          recentMemoryRecalled.value = true
          void recentMemory({ ownerId, limit: 10 }).then((recentResult) => {
            if (recentResult.contextBlock) {
              chatContext.ingestContextMessage(createChatMemoryContext(
                PLAST_MEM_RECENT_MEMORY_CONTEXT_ID,
                recentResult.contextBlock,
              ))
            }
          }).catch((error) => {
            console.warn('[plast-mem-chat-memory] failed to retrieve recent memory:', errorMessageFrom(error) ?? String(error))
          })
        }
      }),
      chatOrchestrator.onChatTurnComplete(async (chat, context) => {
        const userContent = textFromContent(context.message.content)
        const assistantContent = textFromContent(chat.output.content) || chat.outputText.trim()
        const messages: ElectronPlastMemChatMessage[] = []

        if (userContent) {
          messages.push({
            role: 'user',
            content: userContent,
            ...(context.message.createdAt ? { timestamp: context.message.createdAt } : {}),
          })
        }

        if (assistantContent) {
          messages.push({
            role: 'assistant',
            content: assistantContent,
            timestamp: chat.output.createdAt ?? Date.now(),
          })
        }

        if (messages.length === 0)
          return

        const ingestSignature = JSON.stringify({
          messages,
          turn: turnKeyFromContext(context, userContent),
        })
        if (!claimRecentHookSignature(`ingest:${ingestSignature}`))
          return

        const result = await ingestChatMessages({ messages, ownerId })
        lastIngestAt.value = Date.now()
        lastIngestMessageCount.value = messages.length
        if (result.error) {
          lastIngestError.value = result.error
          lastIngestStatus.value = 'error'
          console.warn('[plast-mem-chat-memory] failed to ingest chat messages:', result.error)
          return
        }

        lastIngestError.value = undefined
        lastIngestStatus.value = result.accepted ? 'accepted' : 'rejected'
      }),
    )
  }

  function dispose() {
    for (const disposeFn of disposeFns.value)
      disposeFn()

    disposeFns.value = []
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer)
      healthCheckTimer = undefined
    }
    if (leaseAcquired.value) {
      leaseAcquired.value = false
      void releaseChatBridge({ ownerId }).catch((error) => {
        console.warn('[plast-mem-chat-memory] failed to release lease:', error)
      })
    }
  }

  return {
    dispose,
    initialize,
    lastHealthCheckAt,
    lastHealthCheckOk,
    lastIngestAt,
    lastIngestError,
    lastIngestMessageCount,
    lastIngestStatus,
    lastRecallAt,
    lastRecallContextBlock,
    lastRecallContextCharacters,
    lastRecallError,
    lastRecallStatus,
  }
})
