import type {
  CodingPlastMemBridgeConfidence,
  CodingPlastMemBridgeRecordKind,
  ReviewedCodingMemoryEntryV1,
  ReviewedCodingMemoryStatus,
} from './bridge-record'

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import {
  serializeCodingPlastMemBridgeRecord,
} from './bridge-record'

export interface BuildCodingPlastMemBridgeJsonlOptions {
  exportedAt: string
}

const BRIDGE_RECORD_KINDS: readonly CodingPlastMemBridgeRecordKind[] = [
  'constraint',
  'fact',
  'pitfall',
  'command',
  'file_note',
]

const BRIDGE_CONFIDENCE_VALUES: readonly CodingPlastMemBridgeConfidence[] = [
  'low',
  'medium',
  'high',
]

const REVIEWED_MEMORY_STATUSES: readonly ReviewedCodingMemoryStatus[] = [
  'active',
  'inactive',
  'archived',
  'rejected',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string')
    throw new Error(`reviewed coding memory entry requires string field: ${key}`)
  return value
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value == null)
    return undefined
  if (typeof value !== 'string')
    throw new Error(`reviewed coding memory entry field must be a string when present: ${key}`)
  return value
}

function readStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key]
  if (value == null)
    return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string'))
    throw new Error(`reviewed coding memory entry field must be a string array when present: ${key}`)
  return value
}

function readEnum<T extends string>(record: Record<string, unknown>, key: string, values: readonly T[]): T {
  const value = record[key]
  if (typeof value !== 'string' || !values.includes(value as T))
    throw new Error(`reviewed coding memory entry field has unsupported value: ${key}`)
  return value as T
}

function parseReviewedCodingMemoryEntry(value: unknown): ReviewedCodingMemoryEntryV1 {
  if (!isRecord(value))
    throw new Error('reviewed coding memory entry must be an object')

  const review = value.review
  if (review != null && !isRecord(review))
    throw new Error('reviewed coding memory entry review must be an object when present')
  const reviewRecord: Record<string, unknown> | undefined = review == null
    ? undefined
    : review as Record<string, unknown>

  return {
    workspaceKey: readRequiredString(value, 'workspaceKey'),
    memoryId: readRequiredString(value, 'memoryId'),
    status: readEnum(value, 'status', REVIEWED_MEMORY_STATUSES),
    kind: readEnum(value, 'kind', BRIDGE_RECORD_KINDS),
    statement: readRequiredString(value, 'statement'),
    evidence: readRequiredString(value, 'evidence'),
    confidence: readEnum(value, 'confidence', BRIDGE_CONFIDENCE_VALUES),
    tags: readStringArray(value, 'tags'),
    relatedFiles: readStringArray(value, 'relatedFiles'),
    sourceRunId: readOptionalString(value, 'sourceRunId'),
    reviewRequestId: readOptionalString(value, 'reviewRequestId'),
    humanVerified: value.humanVerified === true,
    review: reviewRecord
      ? {
          reviewer: readRequiredString(reviewRecord, 'reviewer'),
          rationale: readRequiredString(reviewRecord, 'rationale'),
          reviewedAt: readRequiredString(reviewRecord, 'reviewedAt'),
        }
      : undefined,
  }
}

export function parseReviewedCodingMemoryEntriesJson(source: string): ReviewedCodingMemoryEntryV1[] {
  const parsed = JSON.parse(source) as unknown
  const entries = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.entries)
      ? parsed.entries
      : undefined

  if (!entries)
    throw new Error('expected a JSON array or an object with an entries array')

  return entries.map(parseReviewedCodingMemoryEntry)
}

export function buildCodingPlastMemBridgeJsonl(
  entries: readonly ReviewedCodingMemoryEntryV1[],
  options: BuildCodingPlastMemBridgeJsonlOptions,
): string {
  if (entries.length === 0)
    return ''

  return `${entries
    .map(entry => JSON.stringify(serializeCodingPlastMemBridgeRecord(entry, options)))
    .join('\n')}\n`
}

export async function writeCodingPlastMemBridgeJsonlFile(outputPath: string, jsonl: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, jsonl, 'utf-8')
}
