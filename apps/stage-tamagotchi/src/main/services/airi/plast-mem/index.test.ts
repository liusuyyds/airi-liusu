import type { McpStdioManager } from '../mcp-servers'

import { env } from 'node:process'

import { createContext, defineInvoke } from '@moeru/eventa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  electronPlastMemAcquireChatBridge,
  electronPlastMemReleaseChatBridge,
} from '../../../../shared/eventa'
import {
  approvePlastMemPendingReviewQueueItem,
  checkPlastMemHealth,
  createPlastMemService,
  deletePlastMemSemanticMemory,
  dismissPlastMemPendingReviewQueueItem,
  getPlastMemRuntimeStatus,
  ingestPlastMemChatMessages,
  retrievePlastMemChatContext,
  retrievePlastMemPendingReviewQueue,
  retrievePlastMemSemanticMemoryRaw,
  rewritePlastMemPendingReviewQueueItem,
  setPlastMemSemanticMemoryInvalid,
  updatePlastMemConversationMessage,
  updatePlastMemEpisodicMemory,
  updatePlastMemPendingReviewQueueMemory,
  updatePlastMemSemanticMemory,
} from './index'

const envKeys = [
  'AIRI_LOCAL_PLAST_MEM_DEV',
  'COMPUTER_USE_PLAST_MEM_ENABLED',
  'COMPUTER_USE_PLAST_MEM_BASE_URL',
  'COMPUTER_USE_PLAST_MEM_CHAT_INGEST_ENABLED',
  'COMPUTER_USE_PLAST_MEM_CHAT_RETRIEVE_ENABLED',
  'COMPUTER_USE_PLAST_MEM_CONVERSATION_ID',
  'COMPUTER_USE_PLAST_MEM_CONTEXT_PRE_RETRIEVE_ENABLED',
  'COMPUTER_USE_PLAST_MEM_EPISODIC_LIMIT',
  'COMPUTER_USE_PLAST_MEM_RECENT_MEMORY_ENABLED',
  'COMPUTER_USE_PLAST_MEM_SEMANTIC_LIMIT',
  'COMPUTER_USE_PLAST_MEM_MAX_CONTEXT_CHARS',
  'COMPUTER_USE_PLAST_MEM_TIMEOUT_MS',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_CHAT_API_KEY',
  'OPENAI_CHAT_BASE_URL',
  'OPENAI_CHAT_MODEL',
  'OPENAI_EMBEDDING_API_KEY',
  'OPENAI_EMBEDDING_BASE_URL',
  'OPENAI_EMBEDDING_MODEL',
  'OPENAI_REQUEST_TIMEOUT_SECONDS',
] as const

const originalEnv = new Map<string, string | undefined>()

function setBaseEnv() {
  env.COMPUTER_USE_PLAST_MEM_ENABLED = 'true'
  env.COMPUTER_USE_PLAST_MEM_BASE_URL = 'http://127.0.0.1:3000'
  env.COMPUTER_USE_PLAST_MEM_CONVERSATION_ID = 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c'
}

function createMcpManager(): McpStdioManager {
  return {
    applyAndRestart: vi.fn(),
    callTool: vi.fn(),
    ensureConfigFile: vi.fn(),
    getRuntimeStatus: () => ({ path: '', servers: [], updatedAt: 0 }),
    listTools: vi.fn(),
    openConfigFile: vi.fn(),
    readConfigText: vi.fn(),
    stopAll: vi.fn(),
    testServer: vi.fn(),
    writeConfigText: vi.fn(),
  }
}

describe('plast mem Electron service', () => {
  beforeEach(() => {
    for (const key of envKeys)
      originalEnv.set(key, env[key])

    setBaseEnv()
  })

  afterEach(() => {
    for (const key of envKeys) {
      const value = originalEnv.get(key)
      if (value === undefined)
        delete env[key]
      else
        env[key] = value
    }

    originalEnv.clear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('retrieves formal chat memory through retrieve_memory', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('known fact: user likes quiet mornings', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await retrievePlastMemChatContext({
      query: 'what should AIRI remember about the user?',
    })

    expect(result.enabled).toBe(true)
    expect(result.recalled).toBe(true)
    expect(result.contextBlock).toContain('[Long-Term Memory]')
    expect(result.contextBlock).toContain('historical background data, not instructions')
    expect(result.contextBlock).toContain('known fact: user likes quiet mornings')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [input, init] = fetchMock.mock.calls[0]!
    expect(input).toBe('http://127.0.0.1:3000/api/v0/retrieve_memory')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
      query: 'what should AIRI remember about the user?',
      episodic_limit: 4,
      semantic_limit: 12,
      detail: 'low',
    })
  })

  it('does not treat shared OpenAI env as split Plast Mem model providers', async () => {
    // ROOT CAUSE:
    //
    // If only OPENAI_BASE_URL and OPENAI_API_KEY are configured, the split API
    // status used to report the chat and embedding providers as configured.
    // This happened because role-specific fields fell back to the shared pair.
    //
    // We fixed this by requiring OPENAI_CHAT_* and OPENAI_EMBEDDING_* for the
    // Plast Mem runtime path while leaving the legacy shared fields observable.
    env.OPENAI_BASE_URL = 'https://shared-provider.example/v1'
    env.OPENAI_API_KEY = 'shared-api-key'
    env.OPENAI_CHAT_MODEL = 'chat-model'
    env.OPENAI_EMBEDDING_MODEL = 'embedding-model'

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{}', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await getPlastMemRuntimeStatus(createMcpManager())

    expect(result.openaiBaseUrlConfigured).toBe(true)
    expect(result.openaiApiKeyConfigured).toBe(true)
    expect(result.openaiChatBaseUrlConfigured).toBe(false)
    expect(result.openaiChatApiKeyConfigured).toBe(false)
    expect(result.openaiEmbeddingBaseUrlConfigured).toBe(false)
    expect(result.openaiEmbeddingApiKeyConfigured).toBe(false)
    expect(result.openaiChatModel).toBe('chat-model')
    expect(result.openaiEmbeddingModel).toBe('embedding-model')
  })

  it('deduplicates repeated formal chat memory retrievals', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('known fact: user likes quiet mornings', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const payload = {
      query: 'what should AIRI remember about quiet answers?',
    }

    const firstResult = await retrievePlastMemChatContext(payload)
    const secondResult = await retrievePlastMemChatContext(payload)

    expect(firstResult.recalled).toBe(true)
    expect(secondResult.recalled).toBe(false)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('ingests formal chat turns through import_batch_messages', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await ingestPlastMemChatMessages({
      messages: [
        { role: 'user', content: 'I prefer terse answers.', timestamp: 1760000000000 },
        { role: 'assistant', name: 'CardNickname', content: 'Got it.', timestamp: 1760000001000 },
      ],
    })

    expect(result.enabled).toBe(true)
    expect(result.accepted).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()

    const [input, init] = fetchMock.mock.calls[0]!
    expect(input).toBe('http://127.0.0.1:3000/api/v0/import_batch_messages')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
      messages: [
        { role: 'user', content: 'I prefer terse answers.', timestamp: 1760000000000 },
        { role: 'assistant', name: 'CardNickname', content: 'Got it.', timestamp: 1760000001000 },
      ],
    })

    const status = await getPlastMemRuntimeStatus(createMcpManager())

    expect(status.chatDiagnostics?.ingest.messages).toEqual([
      { role: 'user', content: 'I prefer terse answers.', timestamp: 1760000000000 },
      { role: 'assistant', name: 'CardNickname', content: 'Got it.', timestamp: 1760000001000 },
    ])
  })

  it('trims speaker names before importing chat turns', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await ingestPlastMemChatMessages({
      messages: [
        { role: 'assistant', name: '  CardNickname  ', content: 'I will keep roles straight.', timestamp: 1760000001000 },
      ],
    })

    const [, init] = fetchMock.mock.calls[0]!
    expect(JSON.parse(String(init?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
      messages: [
        { role: 'assistant', name: 'CardNickname', content: 'I will keep roles straight.', timestamp: 1760000001000 },
      ],
    })
  })

  // ROOT CAUSE:
  //
  // When no conversation UUID was configured, each request generated a UUID on a
  // freshly resolved runtime config object. Recall and ingest could then write to
  // different Plast Mem conversations during the same app session.
  //
  // We keep one generated UUID for the Electron main process so recall, ingest,
  // health checks, and inspectors address the same conversation.
  it('keeps the auto-generated conversation UUID stable across recall and ingest', async () => {
    delete env.COMPUTER_USE_PLAST_MEM_CONVERSATION_ID
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('known fact: stable generated conversation', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await retrievePlastMemChatContext({
      query: 'what should AIRI remember?',
    })
    await ingestPlastMemChatMessages({
      messages: [
        { role: 'user', content: 'Keep this in the same conversation.', timestamp: 1760000002000 },
      ],
    })

    const [, retrieveInit] = fetchMock.mock.calls[0]!
    const [, ingestInit] = fetchMock.mock.calls[1]!
    const retrieveBody = JSON.parse(String(retrieveInit?.body))
    const ingestBody = JSON.parse(String(ingestInit?.body))

    expect(retrieveBody.conversation_id).toMatch(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/)
    expect(ingestBody.conversation_id).toBe(retrieveBody.conversation_id)
  })

  it('normalizes ISO timestamps before importing chat turns', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await ingestPlastMemChatMessages({
      messages: [
        { role: 'user', content: 'Remember this.', timestamp: '2026-05-21T17:47:19.113Z' },
      ],
    })

    const [, init] = fetchMock.mock.calls[0]!
    expect(JSON.parse(String(init?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
      messages: [
        { role: 'user', content: 'Remember this.', timestamp: 1779385639113 },
      ],
    })
  })

  it('deduplicates repeated formal chat turn imports', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const payload = {
      messages: [
        { role: 'user', content: 'Deduplicate this import.', timestamp: 1760000002000 },
        { role: 'assistant', content: 'Only once.', timestamp: 1760000003000 },
      ],
    }

    const firstResult = await ingestPlastMemChatMessages(payload)
    const secondResult = await ingestPlastMemChatMessages(payload)

    expect(firstResult.accepted).toBe(true)
    expect(secondResult.accepted).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  /**
   * @example
   * const stale = await retrievePlastMemChatContext({ ownerId: 'old-owner', query: 'hello' })
   * expect(stale.error).toContain('stale Plast Mem chat bridge owner')
   */
  it('records stale owner recall attempts in runtime diagnostics', async () => {
    const context = createContext()
    createPlastMemService({
      context: context as never,
      manager: createMcpManager(),
      sidecarManager: {
        getStatus: vi.fn(),
        restart: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      } as never,
    })
    const acquireBridge = defineInvoke(context, electronPlastMemAcquireChatBridge)
    const releaseBridge = defineInvoke(context, electronPlastMemReleaseChatBridge)
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{}', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await acquireBridge({ ownerId: 'authority-owner' })
    await acquireBridge({ ownerId: 'follower-owner' })

    try {
      const result = await retrievePlastMemChatContext({
        ownerId: 'authority-owner',
        query: 'what memory should be recalled?',
      })

      expect(result.recalled).toBe(false)
      expect(result.error).toContain('stale Plast Mem chat bridge owner')
      expect(fetchMock).not.toHaveBeenCalled()

      const status = await getPlastMemRuntimeStatus(createMcpManager())

      expect(status.chatDiagnostics?.recall.status).toBe('error')
      expect(status.chatDiagnostics?.recall.error).toContain('stale Plast Mem chat bridge owner')
      expect(status.chatDiagnostics?.recall.queryCharacters).toBe('what memory should be recalled?'.length)
    }
    finally {
      await releaseBridge({ ownerId: 'follower-owner' })
    }
  })

  it('treats malformed ingest acceptance payloads as rejected', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('not-json', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await ingestPlastMemChatMessages({
      messages: [
        { role: 'user', content: 'Do not silently accept malformed replies.', timestamp: 1760000004000 },
      ],
    })

    expect(result.enabled).toBe(true)
    expect(result.accepted).toBe(false)
  })

  it('does not call Plast Mem when the bridge is disabled', async () => {
    env.COMPUTER_USE_PLAST_MEM_ENABLED = 'false'
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const result = await retrievePlastMemChatContext({ query: 'hello' })

    expect(result.enabled).toBe(false)
    expect(result.recalled).toBe(false)
    expect(result.contextBlock).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not list semantic memories when the bridge is disabled', async () => {
    env.COMPUTER_USE_PLAST_MEM_ENABLED = 'false'
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const result = await retrievePlastMemSemanticMemoryRaw()

    expect(result.enabled).toBe(false)
    expect(result.memories).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not call retrieve_memory when pre-reply recall is disabled', async () => {
    env.COMPUTER_USE_PLAST_MEM_CHAT_RETRIEVE_ENABLED = 'false'
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const result = await retrievePlastMemChatContext({ query: 'hello' })

    expect(result.enabled).toBe(false)
    expect(result.recalled).toBe(false)
    expect(result.contextBlock).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not call import_batch_messages when chat capture is disabled', async () => {
    env.COMPUTER_USE_PLAST_MEM_CHAT_INGEST_ENABLED = 'false'
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const result = await ingestPlastMemChatMessages({
      messages: [
        { role: 'user', content: 'Do not persist this.', timestamp: 1760000004000 },
      ],
    })

    expect(result.enabled).toBe(false)
    expect(result.accepted).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('checks Plast Mem sidecar and database health without probing models by default', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        database_ok: true,
        server_time: '2026-05-22T09:00:00Z',
        conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
        counts: {
          conversation_messages: 4,
          episode_spans: 2,
          episodic_memories: 1,
          semantic_memories: 3,
          active_semantic_memories: 2,
          pending_reviews: 0,
        },
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkPlastMemHealth()

    expect(result.databaseOk).toBe(true)
    expect(result.enabled).toBe(true)
    expect(result.serverTime).toBe('2026-05-22T09:00:00Z')
    expect(result.counts?.semantic_memories).toBe(3)
    expect(result.modelHealth).toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [input, init] = fetchMock.mock.calls[0]!
    expect(input).toBe('http://127.0.0.1:3000/api/v0/health')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
    })
  })

  it('checks Plast Mem model providers when requested', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        database_ok: true,
        server_time: '2026-05-22T09:00:00Z',
        conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
        counts: {
          conversation_messages: 4,
          episode_spans: 2,
          episodic_memories: 1,
          semantic_memories: 3,
          active_semantic_memories: 2,
          pending_reviews: 0,
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        chat: {
          ok: true,
          error: null,
        },
        embedding: {
          ok: false,
          error: 'code=20024 Json mode is not supported for this model.',
        },
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkPlastMemHealth({ includeModelHealth: true })

    expect(result.databaseOk).toBe(true)
    expect(result.enabled).toBe(true)
    expect(result.serverTime).toBe('2026-05-22T09:00:00Z')
    expect(result.counts?.semantic_memories).toBe(3)
    expect(result.modelHealth?.chat.ok).toBe(true)
    expect(result.modelHealth?.embedding.ok).toBe(false)
    expect(result.modelHealth?.embedding.error).toContain('20024')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [input, init] = fetchMock.mock.calls[0]!
    expect(input).toBe('http://127.0.0.1:3000/api/v0/health')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
    })
    const [modelInput, modelInit] = fetchMock.mock.calls[1]!
    expect(modelInput).toBe('http://127.0.0.1:3000/api/v0/model_health')
    expect(modelInit?.method).toBe('POST')
  })

  it('uses a wider timeout budget for model health provider probes', async () => {
    env.COMPUTER_USE_PLAST_MEM_TIMEOUT_MS = '2500'
    env.OPENAI_REQUEST_TIMEOUT_SECONDS = '15'

    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        database_ok: true,
        server_time: '2026-05-22T09:00:00Z',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        chat: {
          ok: true,
          error: null,
        },
        embedding: {
          ok: true,
          error: null,
        },
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await checkPlastMemHealth({ includeModelHealth: true })

    const timeoutDelays = timeoutSpy.mock.calls
      .map(([, delay]) => delay)
      .filter((delay): delay is number => typeof delay === 'number')

    expect(timeoutDelays).toContain(2500)
    expect(timeoutDelays).toContain(15000)
  })

  it('lists pending review queue items through review_queue raw endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify([
        {
          id: 'f0f67f24-1a33-4ef1-a52a-74fd5f113f48',
          conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
          query: 'Remember the user likes concise answers.',
          memory_ids: ['2f72c8fb-7a8c-4285-90a9-85f32ef2db65'],
          created_at: '2026-05-22T09:00:00Z',
          due_memory_count: 1,
          deferred_memory_count: 0,
          review_status: 'due',
          memories: [
            {
              id: '2f72c8fb-7a8c-4285-90a9-85f32ef2db65',
              title: 'Answer preference',
              content: 'The user prefers concise answers.',
              created_at: '2026-05-22T08:00:00Z',
              last_reviewed_at: '2026-05-20T08:00:00Z',
            },
          ],
        },
      ]), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await retrievePlastMemPendingReviewQueue({ limit: 12 })

    expect(result.enabled).toBe(true)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.query).toBe('Remember the user likes concise answers.')
    expect(result.items[0]?.memories[0]?.title).toBe('Answer preference')

    const [input, init] = fetchMock.mock.calls[0]!
    expect(input).toBe('http://127.0.0.1:3000/api/v0/review_queue/raw')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
      limit: 12,
    })
  })

  it('rewrites and approves pending review queue items through dedicated endpoints', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'f0f67f24-1a33-4ef1-a52a-74fd5f113f48',
        conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
        query: 'Keep the concise-answer preference explicit.',
        memory_ids: ['2f72c8fb-7a8c-4285-90a9-85f32ef2db65'],
        created_at: '2026-05-22T09:00:00Z',
        due_memory_count: 1,
        deferred_memory_count: 0,
        review_status: 'due',
        memories: [],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'f0f67f24-1a33-4ef1-a52a-74fd5f113f48',
        conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
        query: 'Keep the concise-answer preference explicit.',
        memory_ids: ['2f72c8fb-7a8c-4285-90a9-85f32ef2db65'],
        created_at: '2026-05-22T09:00:00Z',
        due_memory_count: 1,
        deferred_memory_count: 0,
        review_status: 'due',
        memories: [
          {
            id: '2f72c8fb-7a8c-4285-90a9-85f32ef2db65',
            title: 'Edited preference',
            content: 'The user prefers very concise answers.',
            created_at: '2026-05-22T08:00:00Z',
            last_reviewed_at: '2026-05-20T08:00:00Z',
          },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        consumed: true,
        item_id: 'f0f67f24-1a33-4ef1-a52a-74fd5f113f48',
        updated_memories: 1,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        consumed: true,
        item_id: 'a8cb0334-d2ed-4989-8659-7ead6b5f4d3c',
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const rewriteResult = await rewritePlastMemPendingReviewQueueItem({
      itemId: 'f0f67f24-1a33-4ef1-a52a-74fd5f113f48',
      query: 'Keep the concise-answer preference explicit.',
    })
    const updateMemoryResult = await updatePlastMemPendingReviewQueueMemory({
      itemId: 'f0f67f24-1a33-4ef1-a52a-74fd5f113f48',
      memoryId: '2f72c8fb-7a8c-4285-90a9-85f32ef2db65',
      title: 'Edited preference',
      content: 'The user prefers very concise answers.',
    })
    const approveResult = await approvePlastMemPendingReviewQueueItem({
      itemId: 'f0f67f24-1a33-4ef1-a52a-74fd5f113f48',
    })
    const dismissResult = await dismissPlastMemPendingReviewQueueItem({
      itemId: 'a8cb0334-d2ed-4989-8659-7ead6b5f4d3c',
    })

    expect(rewriteResult.item?.query).toBe('Keep the concise-answer preference explicit.')
    expect(updateMemoryResult.item?.memories[0]?.title).toBe('Edited preference')
    expect(approveResult.consumed).toBe(true)
    expect(approveResult.updatedMemories).toBe(1)
    expect(dismissResult.consumed).toBe(true)

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:3000/api/v0/review_queue/rewrite')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
      item_id: 'f0f67f24-1a33-4ef1-a52a-74fd5f113f48',
      query: 'Keep the concise-answer preference explicit.',
    })
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:3000/api/v0/review_queue/update_memory')
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
      item_id: 'f0f67f24-1a33-4ef1-a52a-74fd5f113f48',
      memory_id: '2f72c8fb-7a8c-4285-90a9-85f32ef2db65',
      title: 'Edited preference',
      content: 'The user prefers very concise answers.',
    })
    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://127.0.0.1:3000/api/v0/review_queue/approve')
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
      item_id: 'f0f67f24-1a33-4ef1-a52a-74fd5f113f48',
    })
    expect(fetchMock.mock.calls[3]?.[0]).toBe('http://127.0.0.1:3000/api/v0/review_queue/dismiss')
  })

  it('lists semantic memories through semantic_memory raw endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify([
        {
          id: 'd0f67f24-1a33-4ef1-a52a-74fd5f113f48',
          conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
          category: 'preference',
          fact: 'The user prefers concise answers.',
          source_episodic_ids: ['2f72c8fb-7a8c-4285-90a9-85f32ef2db65'],
          valid_at: '2026-05-22T09:00:00Z',
          invalid_at: null,
          created_at: '2026-05-22T09:00:01Z',
        },
      ]), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await retrievePlastMemSemanticMemoryRaw({
      category: 'preference',
      includeInvalid: true,
      limit: 2,
    })

    expect(result.enabled).toBe(true)
    expect(result.memories).toHaveLength(1)
    expect(result.memories[0]?.fact).toBe('The user prefers concise answers.')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [input, init] = fetchMock.mock.calls[0]!
    expect(input).toBe('http://127.0.0.1:3000/api/v0/semantic_memory/raw')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
      category: 'preference',
      include_invalid: true,
      limit: 2,
    })
  })

  it('marks semantic memories invalid through semantic_memory set-invalid endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        id: 'd0f67f24-1a33-4ef1-a52a-74fd5f113f48',
        conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
        category: 'preference',
        fact: 'The user prefers concise answers.',
        source_episodic_ids: ['2f72c8fb-7a8c-4285-90a9-85f32ef2db65'],
        valid_at: '2026-05-22T09:00:00Z',
        invalid_at: '2026-05-23T09:00:00Z',
        created_at: '2026-05-22T09:00:01Z',
      }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await setPlastMemSemanticMemoryInvalid({
      invalid: true,
      memoryId: 'd0f67f24-1a33-4ef1-a52a-74fd5f113f48',
    })

    expect(result.enabled).toBe(true)
    expect(result.memory?.invalid_at).toBe('2026-05-23T09:00:00Z')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [input, init] = fetchMock.mock.calls[0]!
    expect(input).toBe('http://127.0.0.1:3000/api/v0/semantic_memory/set_invalid')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
      memory_id: 'd0f67f24-1a33-4ef1-a52a-74fd5f113f48',
      invalid: true,
    })
  })

  it('updates conversation messages and episodic memories through dedicated health endpoints', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        seq: 42,
        role: 'assistant',
        speaker_name: 'AIRI',
        content: 'Updated answer.',
        timestamp: '2026-05-26T09:30:00Z',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: '2f72c8fb-7a8c-4285-90a9-85f32ef2db65',
        conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
        title: 'Updated memory',
        content: 'Updated summary.',
        messages: [],
        classification: 'informative',
        stability: 1,
        difficulty: 1,
        surprise: 0.2,
        start_at: '2026-05-22T08:00:00Z',
        end_at: '2026-05-22T08:10:00Z',
        created_at: '2026-05-22T08:10:00Z',
        last_reviewed_at: '2026-05-22T08:10:00Z',
        consolidated_at: null,
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const messageResult = await updatePlastMemConversationMessage({
      seq: 42,
      role: 'assistant',
      speakerName: 'AIRI',
      content: 'Updated answer.',
      timestamp: '2026-05-26T09:30:00Z',
    })
    const memoryResult = await updatePlastMemEpisodicMemory({
      memoryId: '2f72c8fb-7a8c-4285-90a9-85f32ef2db65',
      title: 'Updated memory',
      content: 'Updated summary.',
    })

    expect(messageResult.enabled).toBe(true)
    expect(messageResult.message?.content).toBe('Updated answer.')
    expect(memoryResult.enabled).toBe(true)
    expect(memoryResult.memory?.title).toBe('Updated memory')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:3000/api/v0/health/conversation_messages/update')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
      seq: 42,
      role: 'assistant',
      speaker_name: 'AIRI',
      content: 'Updated answer.',
      timestamp: '2026-05-26T09:30:00Z',
    })
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:3000/api/v0/health/episodic_memories/update')
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
      memory_id: '2f72c8fb-7a8c-4285-90a9-85f32ef2db65',
      title: 'Updated memory',
      content: 'Updated summary.',
    })
  })

  it('updates semantic memories through semantic_memory update endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        id: 'd0f67f24-1a33-4ef1-a52a-74fd5f113f48',
        conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
        category: 'guideline',
        fact: 'Respond concisely unless the user asks for detail.',
        source_episodic_ids: ['2f72c8fb-7a8c-4285-90a9-85f32ef2db65'],
        valid_at: '2026-05-22T09:00:00Z',
        invalid_at: null,
        created_at: '2026-05-22T09:00:01Z',
      }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await updatePlastMemSemanticMemory({
      category: 'guideline',
      fact: 'Respond concisely unless the user asks for detail.',
      memoryId: 'd0f67f24-1a33-4ef1-a52a-74fd5f113f48',
    })

    expect(result.enabled).toBe(true)
    expect(result.memory?.category).toBe('guideline')
    expect(result.memory?.fact).toBe('Respond concisely unless the user asks for detail.')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [input, init] = fetchMock.mock.calls[0]!
    expect(input).toBe('http://127.0.0.1:3000/api/v0/semantic_memory/update')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
      memory_id: 'd0f67f24-1a33-4ef1-a52a-74fd5f113f48',
      category: 'guideline',
      fact: 'Respond concisely unless the user asks for detail.',
    })
  })

  it('deletes semantic memories through semantic_memory delete endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await deletePlastMemSemanticMemory({
      memoryId: 'd0f67f24-1a33-4ef1-a52a-74fd5f113f48',
    })

    expect(result.enabled).toBe(true)
    expect(result.deleted).toBe(true)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [input, init] = fetchMock.mock.calls[0]!
    expect(input).toBe('http://127.0.0.1:3000/api/v0/semantic_memory/delete')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
      memory_id: 'd0f67f24-1a33-4ef1-a52a-74fd5f113f48',
    })
  })
})
