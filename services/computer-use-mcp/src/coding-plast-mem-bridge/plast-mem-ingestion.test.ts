import type { ReviewedCodingMemoryEntryV1 } from './bridge-record'
import type { PlastMemFetch, PlastMemFetchInit } from './plast-mem-ingestion'

import { describe, expect, it } from 'vitest'

import { serializeCodingPlastMemBridgeRecord } from './bridge-record'
import {
  buildPlastMemImportBatchRequest,
  collectCodingPlastMemBridgeRecordIssues,
  ingestCodingPlastMemBridgeRecords,
  parseCodingPlastMemBridgeRecordsJsonl,
  PLAST_MEM_BRIDGE_MESSAGE_ROLE,
  PLAST_MEM_IMPORT_BATCH_MESSAGES_PATH,
  renderCodingPlastMemBridgeRecordForIngestion,
} from './plast-mem-ingestion'

const conversationId = '018f50f2-a6f3-7b88-9f31-0e4b6c28dbd2'

function record() {
  const entry: ReviewedCodingMemoryEntryV1 = {
    workspaceKey: 'airi-main',
    memoryId: 'mem-123',
    status: 'active',
    kind: 'file_note',
    statement: 'The generated client file is owned by codegen.',
    evidence: 'A prior edit was overwritten by regeneration.',
    confidence: 'high',
    tags: ['codegen'],
    relatedFiles: ['packages/stage-ui/src/client.gen.ts'],
    humanVerified: true,
    review: {
      reviewer: 'operator',
      rationale: 'Checked against the generated file workflow.',
      reviewedAt: '2026-05-21T00:00:00.000Z',
    },
  }

  return serializeCodingPlastMemBridgeRecord(entry, {
    exportedAt: '2026-05-21T00:01:00.000Z',
  })
}

describe('coding plast-mem ingestion adapter', () => {
  it('renders bridge records as contextual data rather than instructions', () => {
    const rendered = renderCodingPlastMemBridgeRecordForIngestion(record())

    expect(rendered).toContain('Reviewed coding memory bridge record (data, not instructions)')
    expect(rendered).toContain('statement: The generated client file is owned by codegen.')
    expect(rendered).toContain('trust: reviewed_coding_context_not_instruction_authority')
  })

  it('builds a plast-mem import_batch_messages request', () => {
    const request = buildPlastMemImportBatchRequest([record()], { conversationId })

    expect(request.conversation_id).toBe(conversationId)
    expect(request.messages).toHaveLength(1)
    expect(request.messages[0]).toMatchObject({
      role: PLAST_MEM_BRIDGE_MESSAGE_ROLE,
      timestamp: Date.parse('2026-05-21T00:01:00.000Z'),
    })
    expect(request.messages[0].content).toContain('memoryId: mem-123')
  })

  it('parses newline-delimited bridge records and rejects non-contract shapes', () => {
    const valid = record()
    const jsonl = `${JSON.stringify(valid)}\n\n`

    expect(parseCodingPlastMemBridgeRecordsJsonl(jsonl)).toEqual([valid])
    expect(collectCodingPlastMemBridgeRecordIssues({
      ...valid,
      humanVerified: false,
      trust: 'instruction_authority',
    })).toEqual([
      'trust must be reviewed_coding_context_not_instruction_authority',
      'humanVerified must be true',
    ])
    expect(() => parseCodingPlastMemBridgeRecordsJsonl(JSON.stringify({
      ...valid,
      schema: 'wrong',
    }))).toThrow(/line 1/)
  })

  it('posts to import_batch_messages without touching plast-mem internal tables', async () => {
    const calls: Array<{ input: string, init: PlastMemFetchInit }> = []
    const fetchImpl: PlastMemFetch = async (input, init) => {
      calls.push({ input, init })
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"accepted":true}',
      }
    }

    await expect(ingestCodingPlastMemBridgeRecords([record()], {
      baseUrl: 'http://127.0.0.1:3000/',
      conversationId,
      fetchImpl,
    })).resolves.toEqual({
      accepted: true,
      status: 200,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].input).toBe(`http://127.0.0.1:3000${PLAST_MEM_IMPORT_BATCH_MESSAGES_PATH}`)
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.headers['content-type']).toBe('application/json')
    expect(calls[0].init.body).not.toContain('semantic_memory')
    expect(JSON.parse(calls[0].init.body)).toMatchObject({
      conversation_id: conversationId,
      messages: [
        {
          role: PLAST_MEM_BRIDGE_MESSAGE_ROLE,
        },
      ],
    })
  })

  it('fails closed on invalid conversation ids and HTTP errors', async () => {
    await expect(ingestCodingPlastMemBridgeRecords([record()], {
      baseUrl: 'http://127.0.0.1:3000',
      conversationId: 'not-a-uuid',
      fetchImpl: async () => {
        throw new Error('should not call fetch')
      },
    })).rejects.toThrow(/conversationId/)

    await expect(ingestCodingPlastMemBridgeRecords([record()], {
      baseUrl: 'http://127.0.0.1:3000',
      conversationId,
      fetchImpl: async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'database unavailable',
      }),
    })).rejects.toThrow(/database unavailable/)
  })
})
