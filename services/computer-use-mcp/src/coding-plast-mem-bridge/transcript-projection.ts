import type {
  TranscriptProjectionOptions,
} from '../transcript/projector'
import type {
  TranscriptEntry,
  TranscriptProjectionResult,
} from '../transcript/types'
import type { ComputerUseConfig } from '../types'
import type {
  CodingTaskPlastMemContextInput,
  RetrieveCodingTaskPlastMemContextOptions,
} from './coding-task-context'

import {
  projectTranscript,
} from '../transcript/projector'
import {
  retrieveCodingTaskPlastMemContextFromConfig,
} from './coding-task-context'

export interface ProjectTranscriptWithCodingPlastMemContextOptions {
  config: Pick<ComputerUseConfig, 'plastMem'>
  transcriptEntries: readonly TranscriptEntry[]
  projectionOptions?: TranscriptProjectionOptions
  codingTask: CodingTaskPlastMemContextInput
  plastMemOptions?: RetrieveCodingTaskPlastMemContextOptions
}

export interface ProjectTranscriptWithCodingPlastMemContextResult {
  projection: TranscriptProjectionResult
  plastMem: {
    query: string
    contextBlock: string
    injected: boolean
  }
}

export async function projectTranscriptWithCodingPlastMemContext(
  options: ProjectTranscriptWithCodingPlastMemContextOptions,
): Promise<ProjectTranscriptWithCodingPlastMemContextResult> {
  const { query, contextBlock } = await retrieveCodingTaskPlastMemContextFromConfig(
    options.config,
    options.codingTask,
    options.plastMemOptions,
  )
  const projection = projectTranscript(options.transcriptEntries, {
    ...options.projectionOptions,
    lowAuthorityContextBlocks: [
      ...(options.projectionOptions?.lowAuthorityContextBlocks ?? []),
      contextBlock,
    ],
  })

  return {
    projection,
    plastMem: {
      query,
      contextBlock,
      injected: !!contextBlock.trim(),
    },
  }
}
