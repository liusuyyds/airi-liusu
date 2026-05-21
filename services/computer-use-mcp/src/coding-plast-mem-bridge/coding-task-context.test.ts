import type { PlastMemContextFetch, PlastMemContextFetchInit } from './plast-mem-retrieval'

import { describe, expect, it } from 'vitest'

import { PLAST_MEM_REVIEWED_CONTEXT_LABEL } from './bridge-record'
import {
  buildCodingTaskPlastMemRetrievalQuery,
  retrieveCodingTaskPlastMemContextFromConfig,
} from './coding-task-context'

const conversationId = '018f50f2-a6f3-7b88-9f31-0e4b6c28dbd2'

describe('coding task plast-mem context helper', () => {
  it('builds a bounded deterministic query from coding task scope', () => {
    const query = buildCodingTaskPlastMemRetrievalQuery({
      taskGoal: 'Wire Plast Mem context into the coding runner.',
      workspaceKey: 'airi-main',
      projectPath: 'G:/zm/nocturne_airi_bridge/airi_main',
      relatedFiles: [
        'services/computer-use-mcp/src/transcript/projector.ts',
        'services/computer-use-mcp/src/transcript/projector.ts',
        'services/computer-use-mcp/src/config.ts',
        ' ',
      ],
      commands: [
        'pnpm -F @proj-airi/computer-use-mcp test',
        'pnpm -F @proj-airi/computer-use-mcp test',
      ],
    }, {
      maxRelatedFiles: 2,
      maxCommands: 1,
    })

    expect(query).toContain('Task goal: Wire Plast Mem context into the coding runner.')
    expect(query).toContain('Workspace key: airi-main')
    expect(query).toContain('Project path: G:/zm/nocturne_airi_bridge/airi_main')
    expect(query).toContain('Relevant files: services/computer-use-mcp/src/transcript/projector.ts, services/computer-use-mcp/src/config.ts')
    expect(query).toContain('Validation or workflow commands: pnpm -F @proj-airi/computer-use-mcp test')
    expect(query).toContain('Return reviewed project context')
  })

  it('bounds long queries before calling plast-mem', () => {
    const query = buildCodingTaskPlastMemRetrievalQuery({
      taskGoal: 'x'.repeat(3000),
      workspaceKey: 'airi-main',
    }, {
      maxCharacters: 200,
    })

    expect(query.length).toBeLessThanOrEqual(200)
    expect(query).toContain('[truncated]')
  })

  it('retrieves low-authority context through computer-use config without throwing when disabled', async () => {
    const disabledResult = await retrieveCodingTaskPlastMemContextFromConfig({
      plastMem: {
        enabled: false,
        workspaceKey: 'airi-main',
        semanticLimit: 8,
        requestTimeoutMs: 2000,
        maxContextCharacters: 6000,
      },
    }, {
      taskGoal: 'Use the bridge helper.',
      workspaceKey: 'airi-main',
    })

    expect(disabledResult.query).toContain('Use the bridge helper.')
    expect(disabledResult.query).toContain('Workspace key: airi-main')
    expect(disabledResult.contextBlock).toBe('')
  })

  it('uses context_pre_retrieve when enabled and returns the guarded context block', async () => {
    const calls: Array<{ input: string, init: PlastMemContextFetchInit }> = []
    const fetchImpl: PlastMemContextFetch = async (input, init) => {
      calls.push({ input, init })
      return {
        ok: true,
        status: 200,
        text: async () => '## Known Facts\n- Prefer the Node-side bridge helper.',
      }
    }

    const result = await retrieveCodingTaskPlastMemContextFromConfig({
      plastMem: {
        enabled: true,
        baseUrl: 'http://127.0.0.1:3000',
        conversationId,
        workspaceKey: 'airi-main',
        semanticLimit: 4,
        requestTimeoutMs: 1500,
        maxContextCharacters: 1024,
      },
    }, {
      taskGoal: 'Use the bridge helper.',
      relatedFiles: ['services/computer-use-mcp/src/coding-plast-mem-bridge/coding-task-context.ts'],
    }, {
      fetchImpl,
    })

    expect(result.query).toContain('Workspace key: airi-main')
    expect(result.contextBlock).toContain(PLAST_MEM_REVIEWED_CONTEXT_LABEL)
    expect(result.contextBlock).toContain('Prefer the Node-side bridge helper.')
    expect(calls).toHaveLength(1)
    expect(JSON.parse(calls[0].init.body)).toMatchObject({
      conversation_id: conversationId,
      semantic_limit: 4,
    })
  })
})
