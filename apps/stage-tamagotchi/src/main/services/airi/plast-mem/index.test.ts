import { env } from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  checkPlastMemHealth,
  ingestPlastMemChatMessages,
  retrievePlastMemChatContext,
  retrievePlastMemSemanticMemoryRaw,
  setPlastMemSemanticMemoryInvalid,
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
] as const

const originalEnv = new Map<string, string | undefined>()

function setBaseEnv() {
  env.COMPUTER_USE_PLAST_MEM_ENABLED = 'true'
  env.COMPUTER_USE_PLAST_MEM_BASE_URL = 'http://127.0.0.1:3000'
  env.COMPUTER_USE_PLAST_MEM_CONVERSATION_ID = 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c'
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
        { role: 'assistant', content: 'Got it.', timestamp: 1760000001000 },
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
        { role: 'assistant', content: 'Got it.', timestamp: 1760000001000 },
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

  it('checks Plast Mem sidecar and database health', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
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
      }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkPlastMemHealth()

    expect(result.databaseOk).toBe(true)
    expect(result.enabled).toBe(true)
    expect(result.serverTime).toBe('2026-05-22T09:00:00Z')
    expect(result.counts?.semantic_memories).toBe(3)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [input, init] = fetchMock.mock.calls[0]!
    expect(input).toBe('http://127.0.0.1:3000/api/v0/health')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      conversation_id: 'c2cb0334-d2ed-4989-8659-7ead6b5f4d3c',
    })
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
})
