import { describe, expect, it } from 'vitest'

import { createTestConfig } from '../test-fixtures'
import { retrieveWorkflowPlastMemContext } from './workflow-plast-mem-context'

describe('retrieveWorkflowPlastMemContext', () => {
  it('returns disabled metadata without calling Plast Mem when the bridge is off', async () => {
    const calls: string[] = []
    const result = await retrieveWorkflowPlastMemContext(
      createTestConfig(),
      {
        taskGoal: 'Validate workspace.',
        projectPath: '/repo/airi',
      },
      {
        fetchImpl: async (input) => {
          calls.push(input)
          return {
            ok: true,
            status: 200,
            text: async () => '',
          }
        },
      },
    )

    expect(result.status).toBe('disabled')
    expect(result.injected).toBe(false)
    expect(result.contextBlock).toBe('')
    expect(result.query).toContain('Task goal: Validate workspace.')
    expect(calls).toEqual([])
  })

  it('returns injected low-authority context for enabled coding workflows', async () => {
    const result = await retrieveWorkflowPlastMemContext(
      createTestConfig({
        plastMem: {
          enabled: true,
          baseUrl: 'http://127.0.0.1:3000',
          conversationId: '018f50f2-a6f3-7b88-9f31-0e4b6c28dbd2',
          workspaceKey: 'airi-main',
          semanticLimit: 8,
          requestTimeoutMs: 2_000,
          maxContextCharacters: 6_000,
        },
      }),
      {
        taskGoal: 'Run computer-use-mcp validation.',
        projectPath: '/repo/airi',
        commands: ['pnpm -F @proj-airi/computer-use-mcp test'],
      },
      {
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          text: async () => '## Known Facts\n- Use package filters for validation.',
        }),
      },
    )

    expect(result.status).toBe('injected')
    expect(result.injected).toBe(true)
    expect(result.query).toContain('Workspace key: airi-main')
    expect(result.query).toContain('Validation or workflow commands: pnpm -F @proj-airi/computer-use-mcp test')
    expect(result.contextBlock).toContain('Plast-Mem reviewed project context')
    expect(result.contextBlock).toContain('Use package filters for validation.')
  })

  it('keeps workflow retrieval non-fatal when Plast Mem is unavailable', async () => {
    const result = await retrieveWorkflowPlastMemContext(
      createTestConfig({
        plastMem: {
          enabled: true,
          baseUrl: 'http://127.0.0.1:3000',
          conversationId: '018f50f2-a6f3-7b88-9f31-0e4b6c28dbd2',
          workspaceKey: undefined,
          semanticLimit: 8,
          requestTimeoutMs: 2_000,
          maxContextCharacters: 6_000,
        },
      }),
      {
        taskGoal: 'Inspect a failed validation command.',
      },
      {
        fetchImpl: async () => {
          throw new Error('connection refused')
        },
      },
    )

    expect(result.status).toBe('unavailable')
    expect(result.injected).toBe(false)
    expect(result.contextBlock).toBe('')
    expect(result.error).toBe('connection refused')
  })
})
