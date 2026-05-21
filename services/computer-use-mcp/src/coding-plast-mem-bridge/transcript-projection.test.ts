import type { TranscriptEntry } from '../transcript/types'
import type { PlastMemContextFetch } from './plast-mem-retrieval'

import { describe, expect, it } from 'vitest'

import { PLAST_MEM_REVIEWED_CONTEXT_LABEL } from './bridge-record'
import {
  projectTranscriptWithCodingPlastMemContext,
} from './transcript-projection'

const conversationId = '018f50f2-a6f3-7b88-9f31-0e4b6c28dbd2'

function userEntry(id: number, content: string): TranscriptEntry {
  return {
    id,
    at: '2026-05-21T00:00:00.000Z',
    role: 'user',
    content,
  }
}

describe('transcript projection with coding plast-mem context', () => {
  it('retrieves and appends plast-mem context as low-authority system text', async () => {
    const fetchImpl: PlastMemContextFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => '## Known Facts\n- Keep Plast Mem context below task memory.',
    })

    const result = await projectTranscriptWithCodingPlastMemContext({
      config: {
        plastMem: {
          enabled: true,
          baseUrl: 'http://127.0.0.1:3000',
          conversationId,
          semanticLimit: 8,
          requestTimeoutMs: 2000,
          maxContextCharacters: 6000,
        },
      },
      transcriptEntries: [userEntry(1, 'please wire memory')],
      projectionOptions: {
        systemPromptBase: 'You are a coding assistant.',
        taskMemoryString: 'Current-run fact wins.',
      },
      codingTask: {
        taskGoal: 'Wire Plast Mem context into transcript projection.',
        workspaceKey: 'airi-main',
      },
      plastMemOptions: {
        fetchImpl,
      },
    })

    expect(result.plastMem.injected).toBe(true)
    expect(result.plastMem.query).toContain('Workspace key: airi-main')
    expect(result.projection.system).toContain('Task Memory\nCurrent-run fact wins.')
    expect(result.projection.system).toContain(PLAST_MEM_REVIEWED_CONTEXT_LABEL)
    expect(result.projection.system.indexOf('Task Memory')).toBeLessThan(
      result.projection.system.indexOf(PLAST_MEM_REVIEWED_CONTEXT_LABEL),
    )
    expect(result.projection.messages).toHaveLength(1)
    expect(result.projection.messages[0].content).toBe('please wire memory')
  })

  it('still projects transcript when plast-mem is disabled', async () => {
    const result = await projectTranscriptWithCodingPlastMemContext({
      config: {
        plastMem: {
          enabled: false,
          semanticLimit: 8,
          requestTimeoutMs: 2000,
          maxContextCharacters: 6000,
        },
      },
      transcriptEntries: [userEntry(1, 'task')],
      projectionOptions: {
        systemPromptBase: 'You are a coding assistant.',
      },
      codingTask: {
        taskGoal: 'Do the task.',
      },
    })

    expect(result.plastMem.injected).toBe(false)
    expect(result.plastMem.contextBlock).toBe('')
    expect(result.projection.system).toBe('You are a coding assistant.')
    expect(result.projection.messages[0].content).toBe('task')
  })
})
