import type { ChatSessionsIndex } from '../../types/chat-session'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const userIdRef = ref<string>('local')
const activeCardIdRef = ref<string>('default')
const systemPromptRef = ref<string>('')

const getIndexMock = vi.fn<(uid: string) => Promise<ChatSessionsIndex | null>>()
const saveIndexMock = vi.fn<(idx: ChatSessionsIndex) => Promise<void>>()
const saveSessionMock = vi.fn<(id: string, rec: { messages: unknown[] }) => Promise<void>>()

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return {
    ...actual,
    storeToRefs: (store: any) => store,
  }
})

vi.mock('../auth', () => ({
  useAuthStore: () => ({ userId: userIdRef }),
}))

vi.mock('../modules/airi-card', () => ({
  useAiriCardStore: () => ({
    activeCardId: activeCardIdRef,
    systemPrompt: systemPromptRef,
  }),
}))

vi.mock('../../database/repos/chat-sessions.repo', () => ({
  chatSessionsRepo: {
    getIndex: (uid: string) => getIndexMock(uid),
    saveIndex: (idx: ChatSessionsIndex) => saveIndexMock(idx),
    getSession: vi.fn().mockResolvedValue(null),
    saveSession: (id: string, rec: { messages: unknown[] }) => saveSessionMock(id, rec),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    getOutbox: vi.fn().mockResolvedValue([]),
    enqueueOutbox: vi.fn().mockResolvedValue(undefined),
    dequeueOutbox: vi.fn().mockResolvedValue(undefined),
    updateOutboxEntries: vi.fn().mockResolvedValue(undefined),
    dropOutboxForSession: vi.fn().mockResolvedValue(undefined),
    getTombstones: vi.fn().mockResolvedValue([]),
    addTombstone: vi.fn().mockResolvedValue(undefined),
    removeTombstones: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../libs/auth-fetch', () => ({
  authedFetch: vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
}))

vi.mock('../../libs/server', () => ({
  SERVER_URL: 'http://test',
}))

vi.mock('../../libs/chat-sync', () => ({
  applyCreateActions: vi.fn().mockResolvedValue([]),
  reconcileLocalAndRemote: vi.fn().mockReturnValue({ adopt: [], claim: [], create: [] }),
  createCloudChatMapper: () => ({
    listChats: vi.fn().mockResolvedValue([]),
    deleteChat: vi.fn().mockResolvedValue(undefined),
  }),
  createChatWsClient: () => ({
    status: () => 'idle' as const,
    connect: vi.fn(),
    disconnect: vi.fn(),
    destroy: vi.fn(),
    sendMessages: vi.fn().mockResolvedValue({ ok: true }),
    pullMessages: vi.fn().mockResolvedValue({ messages: [], maxSeq: 0 }),
    onNewMessages: () => () => {},
    onStatusChange: () => () => {},
  }),
  extractMessageText: (message: { content?: unknown }) => (typeof message?.content === 'string' ? message.content : ''),
  isCloudSyncableMessage: () => false,
  mergeCloudMessagesIntoLocal: () => ({ dirty: false, messages: [], maxSeq: 0 }),
}))

const { useChatSessionStore } = await import('./session-store')

async function flushMicrotasks(rounds = 8) {
  for (let i = 0; i < rounds; i++)
    await Promise.resolve()
}

describe('chat-session-store unload persistence', () => {
  const eventListeners = new Map<string, () => void>()

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    eventListeners.clear()
    userIdRef.value = 'local'
    activeCardIdRef.value = 'default'
    systemPromptRef.value = ''

    getIndexMock.mockReset().mockResolvedValue(null)
    saveIndexMock.mockReset().mockResolvedValue(undefined)
    saveSessionMock.mockReset().mockResolvedValue(undefined)

    ;(globalThis as Record<string, unknown>).addEventListener = vi.fn((event: string, listener: () => void) => {
      eventListeners.set(event, listener)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as Record<string, unknown>).addEventListener
  })

  it('flushes debounced session writes before beforeunload can skip the timer', async () => {
    const store = useChatSessionStore()
    await store.initialize()

    saveSessionMock.mockClear()
    saveIndexMock.mockClear()

    const sessionId = store.activeSessionId
    store.appendSessionMessage(sessionId, {
      role: 'user',
      content: 'persist before close',
      id: 'message-before-unload',
    } as any)

    expect(saveSessionMock).not.toHaveBeenCalled()
    expect(eventListeners.has('beforeunload')).toBe(true)
    expect(eventListeners.has('pagehide')).toBe(true)

    eventListeners.get('beforeunload')?.()
    await flushMicrotasks()

    expect(saveSessionMock).toHaveBeenCalledTimes(1)
    expect(saveSessionMock.mock.calls[0]?.[0]).toBe(sessionId)
    expect(saveSessionMock.mock.calls[0]?.[1]).toMatchObject({
      messages: expect.arrayContaining([
        expect.objectContaining({ id: 'message-before-unload' }),
      ]),
    })

    await vi.advanceTimersByTimeAsync(300)
    expect(saveSessionMock).toHaveBeenCalledTimes(1)
  })
})
