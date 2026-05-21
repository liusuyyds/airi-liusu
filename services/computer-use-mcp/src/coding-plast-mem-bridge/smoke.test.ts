import type { PlastMemFetchInit } from './plast-mem-ingestion'

import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { PLAST_MEM_REVIEWED_CONTEXT_LABEL } from './bridge-record'
import {
  PLAST_MEM_IMPORT_BATCH_MESSAGES_PATH,
} from './plast-mem-ingestion'
import {
  PLAST_MEM_CONTEXT_PRE_RETRIEVE_PATH,
} from './plast-mem-retrieval'
import {
  runCodingPlastMemBridgeSmoke,
} from './smoke'

const conversationId = '018f50f2-a6f3-7b88-9f31-0e4b6c28dbd2'
const exportedAt = '2026-05-21T00:01:00.000Z'

async function readSampleFixture(): Promise<string> {
  return await readFile(new URL('../../fixtures/plast-mem/reviewed-memory.sample.json', import.meta.url), 'utf-8')
}

describe('coding plast-mem bridge smoke flow', () => {
  it('dry-runs the packaged sample reviewed memory without a plast-mem server', async () => {
    const result = await runCodingPlastMemBridgeSmoke({
      reviewedMemoryJson: await readSampleFixture(),
      exportedAt,
    })

    expect(result.entryCount).toBe(2)
    expect(result.bridgeRecordCount).toBe(2)
    expect(result.ingestion).toBeUndefined()
    expect(result.retrievedContextBlock).toBeUndefined()
    expect(result.jsonl).toContain('computer-use-mcp.coding-memory.v1')
  })

  it('can exercise import and pre-retrieve with a supplied fetch implementation', async () => {
    const calls: Array<{ input: string, init: PlastMemFetchInit }> = []

    const result = await runCodingPlastMemBridgeSmoke({
      reviewedMemoryJson: await readSampleFixture(),
      exportedAt,
      baseUrl: 'http://127.0.0.1:3000',
      conversationId,
      query: 'low authority plast mem context',
      fetchImpl: async (input, init) => {
        calls.push({ input, init })
        if (input.endsWith(PLAST_MEM_IMPORT_BATCH_MESSAGES_PATH)) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ accepted: true }),
          }
        }
        if (input.endsWith(PLAST_MEM_CONTEXT_PRE_RETRIEVE_PATH)) {
          return {
            ok: true,
            status: 200,
            text: async () => '## Known Facts\n- Keep retrieved context low authority.',
          }
        }
        throw new Error(`unexpected URL: ${input}`)
      },
    })

    expect(result.ingestion).toEqual({
      accepted: true,
      status: 200,
    })
    expect(result.retrievedContextBlock).toContain(PLAST_MEM_REVIEWED_CONTEXT_LABEL)
    expect(result.retrievedContextBlock).toContain('Keep retrieved context low authority.')
    expect(calls.map(call => call.input)).toEqual([
      `http://127.0.0.1:3000${PLAST_MEM_IMPORT_BATCH_MESSAGES_PATH}`,
      `http://127.0.0.1:3000${PLAST_MEM_CONTEXT_PRE_RETRIEVE_PATH}`,
    ])
  })

  it('requires complete server config when smoke server mode is requested', async () => {
    await expect(runCodingPlastMemBridgeSmoke({
      reviewedMemoryJson: await readSampleFixture(),
      exportedAt,
      baseUrl: 'http://127.0.0.1:3000',
    })).rejects.toThrow(/conversationId/)
  })
})
