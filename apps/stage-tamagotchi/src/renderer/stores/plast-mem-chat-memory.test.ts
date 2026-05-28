import type { Ref } from 'vue'

import type { ElectronPlastMemIngestChatMessagesPayload } from '../../shared/eventa'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

type ChatTurnCompleteHook = (chat: {
  output: {
    content: string
    createdAt?: number
  }
  outputText: string
  toolCalls: unknown[]
}, context: {
    message: {
      content: string
      createdAt?: number
      id?: string
    }
  }) => Promise<void>

type BeforeMessageComposedHook = (message: string, context: {
  message: {
    content: string
    createdAt?: number
    id?: string
  }
}) => Promise<void>

const hooks = vi.hoisted(() => ({
  beforeMessageComposed: [] as BeforeMessageComposedHook[],
  chatTurnComplete: [] as ChatTurnCompleteHook[],
}))

const contextStoreMock = vi.hoisted(() => ({
  ingestContextMessage: vi.fn(),
}))

const invokeMocks = vi.hoisted(() => ({
  acquireChatBridge: vi.fn(async (_payload?: unknown) => ({ acquired: true, activeOwnerId: 'owner-1' })),
  checkHealth: vi.fn(async (_payload?: unknown) => ({ databaseOk: true, enabled: true })),
  contextPreRetrieve: vi.fn(async (_payload?: unknown) => ({ contextBlock: '', enabled: true, recalled: false })),
  ingestChatMessages: vi.fn(async (_payload: ElectronPlastMemIngestChatMessagesPayload) => ({ accepted: true, enabled: true })),
  recentMemory: vi.fn(async (_payload?: unknown) => ({ contextBlock: '', enabled: true, recalled: false })),
  releaseChatBridge: vi.fn(async (_payload?: unknown) => {}),
  retrieveChatContext: vi.fn(async (_payload?: unknown) => ({ contextBlock: '', enabled: true, recalled: false })),
}))

let activeCardRef: Ref<{ name?: string, nickname?: string } | undefined>

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: (eventa: { sendEvent?: { id?: string } }) => {
    const id = eventa.sendEvent?.id ?? ''
    if (id.includes(':acquire-chat-bridge'))
      return invokeMocks.acquireChatBridge
    if (id.includes(':release-chat-bridge'))
      return invokeMocks.releaseChatBridge
    if (id.includes(':health'))
      return invokeMocks.checkHealth
    if (id.includes(':retrieve-chat-context'))
      return invokeMocks.retrieveChatContext
    if (id.includes(':context-pre-retrieve'))
      return invokeMocks.contextPreRetrieve
    if (id.includes(':recent-memory'))
      return invokeMocks.recentMemory
    if (id.includes(':ingest-chat-messages'))
      return invokeMocks.ingestChatMessages
    throw new Error(`Unexpected Plast Mem eventa invoke: ${id}`)
  },
}))

vi.mock('@proj-airi/stage-ui/stores/chat', () => ({
  useChatOrchestratorStore: () => ({
    onBeforeMessageComposed: (hook: BeforeMessageComposedHook) => {
      hooks.beforeMessageComposed.push(hook)
      return () => {
        const index = hooks.beforeMessageComposed.indexOf(hook)
        if (index >= 0)
          hooks.beforeMessageComposed.splice(index, 1)
      }
    },
    onChatTurnComplete: (hook: ChatTurnCompleteHook) => {
      hooks.chatTurnComplete.push(hook)
      return () => {
        const index = hooks.chatTurnComplete.indexOf(hook)
        if (index >= 0)
          hooks.chatTurnComplete.splice(index, 1)
      }
    },
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/chat/context-store', () => ({
  useChatContextStore: () => contextStoreMock,
}))

vi.mock('@proj-airi/stage-ui/stores/modules/airi-card', () => ({
  useAiriCardStore: () => ({
    activeCard: activeCardRef,
  }),
}))

/**
 * @example
 * await hooks.chatTurnComplete[0]?.(assistantTurn, userContext)
 * expect(invokeMocks.ingestChatMessages).toHaveBeenCalledWith({ messages: [expect.objectContaining({ name: 'Nickname' })] })
 */
describe('usePlastMemChatMemoryStore', async () => {
  const { usePlastMemChatMemoryStore } = await import('./plast-mem-chat-memory')

  beforeEach(() => {
    setActivePinia(createPinia())
    hooks.beforeMessageComposed.length = 0
    hooks.chatTurnComplete.length = 0
    activeCardRef = ref({ name: 'CardName', nickname: 'CardNickname' })
    contextStoreMock.ingestContextMessage.mockClear()

    for (const mock of Object.values(invokeMocks))
      mock.mockClear()
  })

  /**
   * @example
   * activeCardRef.value = { name: 'CardName', nickname: 'CardNickname' }
   * expect(importedAssistantMessage.name).toBe('CardNickname')
   */
  it('uses the active card nickname as the captured assistant speaker name', async () => {
    const store = usePlastMemChatMemoryStore()
    await store.initialize()

    await hooks.chatTurnComplete[0]?.({
      output: {
        content: 'Okay.',
        createdAt: 1760000001000,
      },
      outputText: 'Okay.',
      toolCalls: [],
    }, {
      message: {
        content: 'spicy topic',
        createdAt: 1760000000000,
        id: 'turn-1',
      },
    })

    expect(invokeMocks.ingestChatMessages).toHaveBeenCalledTimes(1)
    expect(invokeMocks.ingestChatMessages.mock.calls[0]?.[0]).toEqual({
      messages: [
        { role: 'user', content: 'spicy topic', timestamp: 1760000000000 },
        { role: 'assistant', name: 'CardNickname', content: 'Okay.', timestamp: 1760000001000 },
      ],
      ownerId: expect.any(String),
    })
  })

  /**
   * @example
   * activeCardRef.value = { name: 'CardName', nickname: '' }
   * expect(importedAssistantMessage.name).toBe('CardName')
   */
  it('falls back to the active card name when nickname is empty', async () => {
    activeCardRef.value = { name: 'CardName', nickname: '   ' }
    const store = usePlastMemChatMemoryStore()
    await store.initialize()

    await hooks.chatTurnComplete[0]?.({
      output: {
        content: 'Received.',
        createdAt: 1760000001000,
      },
      outputText: 'Received.',
      toolCalls: [],
    }, {
      message: {
        content: 'remember this',
        createdAt: 1760000000000,
        id: 'turn-2',
      },
    })

    const payload = invokeMocks.ingestChatMessages.mock.calls[0]?.[0]
    expect(payload?.messages[1]).toEqual({
      role: 'assistant',
      name: 'CardName',
      content: 'Received.',
      timestamp: 1760000001000,
    })
  })

  /**
   * @example
   * await hooks.beforeMessageComposed[0]?.('hello', turnContext)
   * activeCardRef.value = { name: 'NextCard', nickname: 'NextNickname' }
   * expect(importedAssistantMessage.name).toBe('StartingNickname')
   */
  it('keeps the speaker name from the card that started the chat turn', async () => {
    activeCardRef.value = { name: 'StartingCard', nickname: 'StartingNickname' }
    const store = usePlastMemChatMemoryStore()
    await store.initialize()

    await hooks.beforeMessageComposed[0]?.('hello', {
      message: {
        content: 'hello',
        createdAt: 1760000000000,
        id: 'turn-3',
      },
    })
    activeCardRef.value = { name: 'NextCard', nickname: 'NextNickname' }

    await hooks.chatTurnComplete[0]?.({
      output: {
        content: 'Still the first card.',
        createdAt: 1760000001000,
      },
      outputText: 'Still the first card.',
      toolCalls: [],
    }, {
      message: {
        content: 'hello',
        createdAt: 1760000000000,
        id: 'turn-3',
      },
    })

    const payload = invokeMocks.ingestChatMessages.mock.calls[0]?.[0]
    expect(payload?.messages[1]).toEqual({
      role: 'assistant',
      name: 'StartingNickname',
      content: 'Still the first card.',
      timestamp: 1760000001000,
    })
  })

  /**
   * @example
   * const initializePromise = store.initialize()
   * store.dispose()
   * resolveAcquire({ acquired: true })
   * await initializePromise
   * expect(invokeMocks.releaseChatBridge).toHaveBeenCalledOnce()
   */
  it('releases a stale lease when dispose wins the initialize race', async () => {
    let resolveAcquire: ((value: { acquired: true, activeOwnerId: string }) => void) | undefined
    invokeMocks.acquireChatBridge.mockImplementationOnce(async () => {
      return await new Promise((resolve) => {
        resolveAcquire = resolve
      })
    })
    const store = usePlastMemChatMemoryStore()

    const initializePromise = store.initialize()
    await Promise.resolve()
    store.dispose()
    resolveAcquire?.({ acquired: true, activeOwnerId: 'owner-1' })
    await initializePromise

    expect(invokeMocks.releaseChatBridge).toHaveBeenCalledTimes(1)
    expect(hooks.beforeMessageComposed).toHaveLength(0)
    expect(hooks.chatTurnComplete).toHaveLength(0)
  })

  /**
   * @example
   * const recallPromise = hooks.beforeMessageComposed[0]?.('hello', turnContext)
   * await vi.waitFor(() => expect(invokeMocks.recentMemory).toHaveBeenCalledOnce())
   * store.dispose()
   * resolveRecent({ contextBlock: 'stale recent memory' })
   * await recallPromise
   * expect(contextStoreMock.ingestContextMessage).not.toHaveBeenCalled()
   */
  it('does not write recent memory into context after dispose', async () => {
    let resolveRecent: ((value: { contextBlock: string, enabled: true, recalled: true }) => void) | undefined
    invokeMocks.recentMemory.mockImplementationOnce(async () => {
      return await new Promise((resolve) => {
        resolveRecent = resolve
      })
    })
    const store = usePlastMemChatMemoryStore()
    await store.initialize()

    await hooks.beforeMessageComposed[0]?.('hello', {
      message: {
        content: 'hello',
        createdAt: 1760000000000,
        id: 'turn-recent',
      },
    })
    await vi.waitFor(() => {
      expect(invokeMocks.recentMemory).toHaveBeenCalledTimes(1)
    })

    store.dispose()
    resolveRecent?.({ contextBlock: 'stale recent memory', enabled: true, recalled: true })
    await Promise.resolve()
    await Promise.resolve()

    expect(contextStoreMock.ingestContextMessage).not.toHaveBeenCalled()
  })
})
