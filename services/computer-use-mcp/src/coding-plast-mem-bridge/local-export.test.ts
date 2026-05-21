import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  buildCodingPlastMemBridgeJsonl,
  parseReviewedCodingMemoryEntriesJson,
  writeCodingPlastMemBridgeJsonlFile,
} from './local-export'

const exportedAt = '2026-05-21T00:01:00.000Z'

function entryJson(overrides: Record<string, unknown> = {}) {
  return {
    workspaceKey: 'airi-main',
    memoryId: 'mem-123',
    status: 'active',
    kind: 'constraint',
    statement: 'Always run the targeted package test before touching release gates.',
    evidence: 'The previous run caught a package-local regression before broad validation.',
    confidence: 'high',
    tags: ['tests'],
    relatedFiles: ['services/computer-use-mcp/src/workflows/engine.ts'],
    humanVerified: true,
    review: {
      reviewer: 'operator',
      rationale: 'Manually checked against the run notes.',
      reviewedAt: '2026-05-21T00:00:00.000Z',
    },
    ...overrides,
  }
}

describe('coding plast-mem local export', () => {
  let tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })))
    tempDirs = []
  })

  it('parses reviewed coding memory entries from an array or wrapper object', () => {
    expect(parseReviewedCodingMemoryEntriesJson(JSON.stringify([entryJson()]))).toHaveLength(1)
    expect(parseReviewedCodingMemoryEntriesJson(JSON.stringify({ entries: [entryJson()] }))).toHaveLength(1)
  })

  it('builds newline-delimited bridge records for operator export', () => {
    const entries = parseReviewedCodingMemoryEntriesJson(JSON.stringify({
      entries: [
        entryJson(),
        entryJson({
          memoryId: 'mem-456',
          kind: 'command',
          statement: 'Use pnpm package filters for computer-use-mcp checks.',
        }),
      ],
    }))

    const jsonl = buildCodingPlastMemBridgeJsonl(entries, { exportedAt })
    const lines = jsonl.trimEnd().split('\n')

    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0])).toMatchObject({
      schema: 'computer-use-mcp.coding-memory.v1',
      source: 'computer-use-mcp',
      memoryId: 'mem-123',
      humanVerified: true,
      trust: 'reviewed_coding_context_not_instruction_authority',
      exportedAt,
    })
    expect(JSON.parse(lines[1])).toMatchObject({
      memoryId: 'mem-456',
      kind: 'command',
    })
  })

  it('rejects ineligible entries before JSONL export', () => {
    const entries = parseReviewedCodingMemoryEntriesJson(JSON.stringify([
      entryJson({ humanVerified: false }),
    ]))

    expect(() => buildCodingPlastMemBridgeJsonl(entries, { exportedAt })).toThrow(/human verified/)
  })

  it('does not accept raw task-memory shaped input as reviewed memory', () => {
    expect(() => parseReviewedCodingMemoryEntriesJson(JSON.stringify([
      {
        goal: 'current task',
        confirmedFacts: ['current-run only'],
        sourceTurnId: 'turn-1',
      },
    ]))).toThrow(/workspaceKey/)
  })

  it('writes exported JSONL to a local operator-selected file', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'coding-plast-mem-'))
    tempDirs.push(tempDir)
    const outputPath = join(tempDir, 'exports', 'bridge.jsonl')
    const jsonl = buildCodingPlastMemBridgeJsonl(parseReviewedCodingMemoryEntriesJson(JSON.stringify([entryJson()])), { exportedAt })

    await writeCodingPlastMemBridgeJsonlFile(outputPath, jsonl)

    expect(await readFile(outputPath, 'utf-8')).toBe(jsonl)
  })

  it('keeps the packaged reviewed-memory sample exportable', async () => {
    const fixture = await readFile(new URL('../../fixtures/plast-mem/reviewed-memory.sample.json', import.meta.url), 'utf-8')
    const entries = parseReviewedCodingMemoryEntriesJson(fixture)
    const jsonl = buildCodingPlastMemBridgeJsonl(entries, { exportedAt })

    expect(entries).toHaveLength(2)
    expect(jsonl.trimEnd().split('\n')).toHaveLength(2)
  })
})
