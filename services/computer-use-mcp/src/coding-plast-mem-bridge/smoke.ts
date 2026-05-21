import type { PlastMemFetch } from './plast-mem-ingestion'
import type { PlastMemContextFetch } from './plast-mem-retrieval'

import {
  buildCodingPlastMemBridgeJsonl,
  parseReviewedCodingMemoryEntriesJson,
} from './local-export'
import {
  ingestCodingPlastMemBridgeRecords,
  parseCodingPlastMemBridgeRecordsJsonl,
} from './plast-mem-ingestion'
import {
  retrievePlastMemReviewedContextBlock,
} from './plast-mem-retrieval'

export interface RunCodingPlastMemBridgeSmokeOptions {
  reviewedMemoryJson: string
  exportedAt: string
  baseUrl?: string
  conversationId?: string
  query?: string
  semanticLimit?: number
  timeoutMs?: number
  maxContextCharacters?: number
  fetchImpl?: PlastMemFetch & PlastMemContextFetch
}

export interface RunCodingPlastMemBridgeSmokeResult {
  entryCount: number
  bridgeRecordCount: number
  jsonl: string
  ingestion?: {
    accepted: boolean
    status: number
  }
  retrievedContextBlock?: string
}

function hasServerConfig(options: RunCodingPlastMemBridgeSmokeOptions): boolean {
  return !!options.baseUrl || !!options.conversationId
}

function requireServerConfig(options: RunCodingPlastMemBridgeSmokeOptions): {
  baseUrl: string
  conversationId: string
} {
  if (!options.baseUrl)
    throw new Error('baseUrl is required for plast-mem bridge smoke server mode')
  if (!options.conversationId)
    throw new Error('conversationId is required for plast-mem bridge smoke server mode')

  return {
    baseUrl: options.baseUrl,
    conversationId: options.conversationId,
  }
}

export async function runCodingPlastMemBridgeSmoke(
  options: RunCodingPlastMemBridgeSmokeOptions,
): Promise<RunCodingPlastMemBridgeSmokeResult> {
  const entries = parseReviewedCodingMemoryEntriesJson(options.reviewedMemoryJson)
  const jsonl = buildCodingPlastMemBridgeJsonl(entries, {
    exportedAt: options.exportedAt,
  })
  const records = parseCodingPlastMemBridgeRecordsJsonl(jsonl)

  const result: RunCodingPlastMemBridgeSmokeResult = {
    entryCount: entries.length,
    bridgeRecordCount: records.length,
    jsonl,
  }

  if (!hasServerConfig(options))
    return result

  const server = requireServerConfig(options)
  result.ingestion = await ingestCodingPlastMemBridgeRecords(records, {
    ...server,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  })

  if (options.query?.trim()) {
    result.retrievedContextBlock = await retrievePlastMemReviewedContextBlock({
      ...server,
      query: options.query,
      semanticLimit: options.semanticLimit,
      timeoutMs: options.timeoutMs,
      maxCharacters: options.maxContextCharacters,
      fetchImpl: options.fetchImpl,
    })
  }

  return result
}
