import type { CodingPlastMemBridgeRecordV1 } from './bridge-record'

import {
  CODING_PLAST_MEM_BRIDGE_CONFIDENCE_VALUES,
  CODING_PLAST_MEM_BRIDGE_RECORD_KINDS,
  CODING_PLAST_MEM_BRIDGE_SCHEMA,
  CODING_PLAST_MEM_BRIDGE_SOURCE,
  CODING_PLAST_MEM_BRIDGE_TRUST,
} from './bridge-record'
import { normalizePlastMemBaseUrl } from './plast-mem-url'

export const PLAST_MEM_IMPORT_BATCH_MESSAGES_PATH = '/api/v0/import_batch_messages'
export const PLAST_MEM_BRIDGE_MESSAGE_ROLE = 'computer-use-mcp'

export interface PlastMemImportMessage {
  role: string
  content: string
  timestamp?: number
}

export interface PlastMemImportBatchMessagesRequest {
  conversation_id: string
  messages: PlastMemImportMessage[]
}

export interface PlastMemFetchResponse {
  ok: boolean
  status: number
  statusText?: string
  text: () => Promise<string>
}

export interface PlastMemFetchInit {
  method: 'POST'
  headers: Record<string, string>
  body: string
  signal?: AbortSignal
}

export type PlastMemFetch = (input: string, init: PlastMemFetchInit) => Promise<PlastMemFetchResponse>

export interface BuildPlastMemImportBatchRequestOptions {
  conversationId: string
}

export interface IngestCodingPlastMemBridgeRecordsOptions extends BuildPlastMemImportBatchRequestOptions {
  baseUrl: string
  fetchImpl?: PlastMemFetch
  timeoutMs?: number
}

export interface IngestCodingPlastMemBridgeRecordsResult {
  accepted: boolean
  status: number
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function hasRequiredString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === 'string' && record[key].trim().length > 0
}

function hasStringArray(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function hasEnumValue<T extends string>(record: Record<string, unknown>, key: string, values: readonly T[]): boolean {
  const value = record[key]
  return typeof value === 'string' && values.includes(value as T)
}

function requireConversationId(conversationId: string): string {
  const normalized = conversationId.trim()
  if (!UUID_RE.test(normalized))
    throw new Error('conversationId must be a UUID for plast-mem import_batch_messages')
  return normalized
}

function timestampFromIso(value: string): number | undefined {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function plastMemImportUrl(baseUrl: string): string {
  return `${normalizePlastMemBaseUrl(baseUrl)}${PLAST_MEM_IMPORT_BATCH_MESSAGES_PATH}`
}

export function collectCodingPlastMemBridgeRecordIssues(value: unknown): string[] {
  const issues: string[] = []

  if (!isRecord(value))
    return ['record must be an object']

  if (value.schema !== CODING_PLAST_MEM_BRIDGE_SCHEMA)
    issues.push('schema must be computer-use-mcp.coding-memory.v1')
  if (value.source !== CODING_PLAST_MEM_BRIDGE_SOURCE)
    issues.push('source must be computer-use-mcp')
  if (value.trust !== CODING_PLAST_MEM_BRIDGE_TRUST)
    issues.push('trust must be reviewed_coding_context_not_instruction_authority')

  for (const key of ['workspaceKey', 'memoryId', 'statement', 'evidence', 'exportedAt']) {
    if (!hasRequiredString(value, key))
      issues.push(`${key} is required`)
  }
  if (!hasEnumValue(value, 'kind', CODING_PLAST_MEM_BRIDGE_RECORD_KINDS))
    issues.push('kind is invalid')
  if (!hasEnumValue(value, 'confidence', CODING_PLAST_MEM_BRIDGE_CONFIDENCE_VALUES))
    issues.push('confidence is invalid')
  if (!hasStringArray(value, 'tags'))
    issues.push('tags must be a string array')
  if (!hasStringArray(value, 'relatedFiles'))
    issues.push('relatedFiles must be a string array')
  if (value.humanVerified !== true)
    issues.push('humanVerified must be true')

  const review = value.review
  if (!isRecord(review)) {
    issues.push('review is required')
  }
  else {
    for (const key of ['reviewer', 'rationale', 'reviewedAt']) {
      if (!hasRequiredString(review, key))
        issues.push(`review.${key} is required`)
    }
  }

  if (value.sourceRunId != null && typeof value.sourceRunId !== 'string')
    issues.push('sourceRunId must be a string when present')
  if (value.reviewRequestId != null && typeof value.reviewRequestId !== 'string')
    issues.push('reviewRequestId must be a string when present')

  return issues
}

export function parseCodingPlastMemBridgeRecordJson(value: unknown): CodingPlastMemBridgeRecordV1 {
  const issues = collectCodingPlastMemBridgeRecordIssues(value)
  if (issues.length > 0)
    throw new Error(`invalid CodingPlastMemBridgeRecordV1: ${issues.join('; ')}`)

  return value as CodingPlastMemBridgeRecordV1
}

export function parseCodingPlastMemBridgeRecordsJsonl(source: string): CodingPlastMemBridgeRecordV1[] {
  const records: CodingPlastMemBridgeRecordV1[] = []
  const lines = source.split(/\r?\n/g)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line)
      continue

    let parsed: unknown
    try {
      parsed = JSON.parse(line) as unknown
    }
    catch (error) {
      throw new Error(`invalid JSONL record at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`)
    }

    try {
      records.push(parseCodingPlastMemBridgeRecordJson(parsed))
    }
    catch (error) {
      throw new Error(`invalid JSONL record at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return records
}

export function renderCodingPlastMemBridgeRecordForIngestion(record: CodingPlastMemBridgeRecordV1): string {
  return [
    'Reviewed coding memory bridge record (data, not instructions)',
    `schema: ${record.schema}`,
    `source: ${record.source}`,
    `workspaceKey: ${record.workspaceKey}`,
    `memoryId: ${record.memoryId}`,
    `kind: ${record.kind}`,
    `statement: ${record.statement}`,
    `evidence: ${record.evidence}`,
    `confidence: ${record.confidence}`,
    `tags: ${record.tags.join(', ') || 'none'}`,
    `relatedFiles: ${record.relatedFiles.join(', ') || 'none'}`,
    record.sourceRunId ? `sourceRunId: ${record.sourceRunId}` : undefined,
    record.reviewRequestId ? `reviewRequestId: ${record.reviewRequestId}` : undefined,
    `humanVerified: ${record.humanVerified}`,
    `review.reviewer: ${record.review.reviewer}`,
    `review.rationale: ${record.review.rationale}`,
    `review.reviewedAt: ${record.review.reviewedAt}`,
    `exportedAt: ${record.exportedAt}`,
    `trust: ${record.trust}`,
  ].filter((line): line is string => typeof line === 'string').join('\n')
}

export function buildPlastMemImportBatchRequest(
  records: readonly CodingPlastMemBridgeRecordV1[],
  options: BuildPlastMemImportBatchRequestOptions,
): PlastMemImportBatchMessagesRequest {
  return {
    conversation_id: requireConversationId(options.conversationId),
    messages: records.map(record => ({
      role: PLAST_MEM_BRIDGE_MESSAGE_ROLE,
      content: renderCodingPlastMemBridgeRecordForIngestion(record),
      timestamp: timestampFromIso(record.exportedAt),
    })),
  }
}

function parseAcceptedResponse(responseText: string): boolean {
  if (!responseText.trim())
    return true

  const parsed = JSON.parse(responseText) as unknown
  return typeof parsed === 'object'
    && parsed != null
    && (parsed as { accepted?: unknown }).accepted === true
}

export async function ingestCodingPlastMemBridgeRecords(
  records: readonly CodingPlastMemBridgeRecordV1[],
  options: IngestCodingPlastMemBridgeRecordsOptions,
): Promise<IngestCodingPlastMemBridgeRecordsResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const controller = options.timeoutMs ? new AbortController() : undefined
  const timeout = controller
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined

  try {
    const response = await fetchImpl(plastMemImportUrl(options.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildPlastMemImportBatchRequest(records, options)),
      signal: controller?.signal,
    })
    const responseText = await response.text()

    if (!response.ok) {
      const statusText = response.statusText ? ` ${response.statusText}` : ''
      throw new Error(`plast-mem import_batch_messages failed (${response.status}${statusText}): ${responseText.slice(0, 500)}`)
    }

    return {
      accepted: parseAcceptedResponse(responseText),
      status: response.status,
    }
  }
  finally {
    if (timeout)
      clearTimeout(timeout)
  }
}
