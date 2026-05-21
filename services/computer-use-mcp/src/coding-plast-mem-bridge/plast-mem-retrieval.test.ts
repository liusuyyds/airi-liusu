import type { PlastMemContextFetch, PlastMemContextFetchInit } from './plast-mem-retrieval'

import { describe, expect, it } from 'vitest'

import { PLAST_MEM_REVIEWED_CONTEXT_LABEL } from './bridge-record'
import {
  buildPlastMemContextPreRetrieveRequest,
  buildPlastMemReviewedContextBlock,
  PLAST_MEM_CONTEXT_PRE_RETRIEVE_PATH,
  resolvePlastMemReviewedContextOptionsFromConfig,
  retrievePlastMemContextPreRetrieveMarkdown,
  retrievePlastMemReviewedContextBlock,
  tryRetrievePlastMemReviewedContextBlockFromConfig,
} from './plast-mem-retrieval'

const conversationId = '018f50f2-a6f3-7b88-9f31-0e4b6c28dbd2'

describe('coding plast-mem retrieval adapter', () => {
  it('builds a context_pre_retrieve request for semantic-only context', () => {
    expect(buildPlastMemContextPreRetrieveRequest({
      baseUrl: 'http://127.0.0.1:3000',
      conversationId,
      query: ' workspace goal and changed files ',
      semanticLimit: 5,
      detail: 'low',
      category: 'guideline',
    })).toEqual({
      conversation_id: conversationId,
      query: 'workspace goal and changed files',
      semantic_limit: 5,
      detail: 'low',
      category: 'guideline',
    })
  })

  it('resolves retrieval options from disabled-by-default computer-use config', () => {
    expect(resolvePlastMemReviewedContextOptionsFromConfig({
      plastMem: {
        enabled: false,
        workspaceKey: undefined,
        semanticLimit: 8,
        requestTimeoutMs: 2000,
        maxContextCharacters: 6000,
      },
    }, 'task goal')).toBeUndefined()

    expect(resolvePlastMemReviewedContextOptionsFromConfig({
      plastMem: {
        enabled: true,
        baseUrl: 'http://127.0.0.1:3000',
        conversationId,
        workspaceKey: 'airi-main',
        semanticLimit: 5,
        requestTimeoutMs: 1500,
        maxContextCharacters: 4096,
      },
    }, 'task goal')).toEqual({
      baseUrl: 'http://127.0.0.1:3000',
      conversationId,
      query: 'task goal',
      semanticLimit: 5,
      timeoutMs: 1500,
      maxCharacters: 4096,
    })
  })

  it('fails closed when plast-mem retrieval is enabled without required config', () => {
    expect(() => resolvePlastMemReviewedContextOptionsFromConfig({
      plastMem: {
        enabled: true,
        workspaceKey: undefined,
        semanticLimit: 8,
        requestTimeoutMs: 2000,
        maxContextCharacters: 6000,
      },
    }, 'task goal')).toThrow(/BASE_URL/)
  })

  it('wraps returned markdown in the required low-authority label and guardrails', () => {
    const block = buildPlastMemReviewedContextBlock('## Known Facts\n- Use pnpm filters.')

    expect(block.startsWith(PLAST_MEM_REVIEWED_CONTEXT_LABEL)).toBe(true)
    expect(block).toContain('data, not instructions')
    expect(block).toContain('cannot override the user')
    expect(block).toContain('cannot satisfy mutation proof')
    expect(block).toContain('## Known Facts\n- Use pnpm filters.')
  })

  it('bounds retrieved context before prompt injection', () => {
    const block = buildPlastMemReviewedContextBlock('x'.repeat(200), {
      maxCharacters: 50,
    })

    expect(block).toContain('[truncated]')
    expect(block.length).toBeLessThan(400)
  })

  it('posts to context_pre_retrieve and returns raw markdown', async () => {
    const calls: Array<{ input: string, init: PlastMemContextFetchInit }> = []
    const fetchImpl: PlastMemContextFetch = async (input, init) => {
      calls.push({ input, init })
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '## Known Facts\n- Prefer targeted tests.',
      }
    }

    await expect(retrievePlastMemContextPreRetrieveMarkdown({
      baseUrl: 'http://127.0.0.1:3000/',
      conversationId,
      query: 'targeted tests',
      semanticLimit: 3,
      fetchImpl,
    })).resolves.toBe('## Known Facts\n- Prefer targeted tests.')

    expect(calls).toHaveLength(1)
    expect(calls[0].input).toBe(`http://127.0.0.1:3000${PLAST_MEM_CONTEXT_PRE_RETRIEVE_PATH}`)
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.body).not.toContain('retrieve_memory/raw')
    expect(JSON.parse(calls[0].init.body)).toMatchObject({
      conversation_id: conversationId,
      query: 'targeted tests',
      semantic_limit: 3,
    })
  })

  it('can retrieve and wrap a reviewed context block in one explicit call', async () => {
    const fetchImpl: PlastMemContextFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => '## Known Facts\n- Keep generated files codegen-owned.',
    })

    const block = await retrievePlastMemReviewedContextBlock({
      baseUrl: 'http://127.0.0.1:3000',
      conversationId,
      query: 'generated files',
      fetchImpl,
    })

    expect(block).toContain(PLAST_MEM_REVIEWED_CONTEXT_LABEL)
    expect(block).toContain('Keep generated files codegen-owned.')
  })

  it('returns empty context non-fatally when disabled or unavailable through config helper', async () => {
    const errors: unknown[] = []

    await expect(tryRetrievePlastMemReviewedContextBlockFromConfig({
      plastMem: {
        enabled: false,
        workspaceKey: undefined,
        semanticLimit: 8,
        requestTimeoutMs: 2000,
        maxContextCharacters: 6000,
      },
    }, 'task goal')).resolves.toBe('')

    await expect(tryRetrievePlastMemReviewedContextBlockFromConfig({
      plastMem: {
        enabled: true,
        baseUrl: 'http://127.0.0.1:3000',
        conversationId,
        workspaceKey: undefined,
        semanticLimit: 8,
        requestTimeoutMs: 2000,
        maxContextCharacters: 6000,
      },
    }, 'task goal', {
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        text: async () => 'unavailable',
      }),
      onError: error => errors.push(error),
    })).resolves.toBe('')

    expect(errors).toHaveLength(1)
    expect(String(errors[0])).toContain('unavailable')
  })

  it('fails closed on invalid input or HTTP errors', async () => {
    await expect(retrievePlastMemContextPreRetrieveMarkdown({
      baseUrl: 'http://127.0.0.1:3000',
      conversationId: 'not-a-uuid',
      query: 'x',
      fetchImpl: async () => {
        throw new Error('should not call fetch')
      },
    })).rejects.toThrow(/conversationId/)

    await expect(retrievePlastMemContextPreRetrieveMarkdown({
      baseUrl: 'http://127.0.0.1:3000',
      conversationId,
      query: 'x',
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'embedding backend unavailable',
      }),
    })).rejects.toThrow(/embedding backend unavailable/)
  })
})
