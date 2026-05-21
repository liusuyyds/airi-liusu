import type {
  CodingTaskPlastMemContextInput,
  RetrieveCodingTaskPlastMemContextOptions,
} from '../coding-plast-mem-bridge'
import type { ComputerUseConfig } from '../types'

import { errorMessageFrom } from '@moeru/std'

import {
  retrieveCodingTaskPlastMemContextFromConfig,
} from '../coding-plast-mem-bridge'

export type WorkflowPlastMemContextStatus = 'disabled' | 'injected' | 'empty' | 'unavailable'

export interface WorkflowPlastMemContext {
  status: WorkflowPlastMemContextStatus
  query: string
  contextBlock: string
  injected: boolean
  error?: string
}

export interface RetrieveWorkflowPlastMemContextOptions extends RetrieveCodingTaskPlastMemContextOptions {}

export async function retrieveWorkflowPlastMemContext(
  config: Pick<ComputerUseConfig, 'plastMem'>,
  codingTask: CodingTaskPlastMemContextInput,
  options: RetrieveWorkflowPlastMemContextOptions = {},
): Promise<WorkflowPlastMemContext> {
  let errorMessage: string | undefined
  const { query, contextBlock } = await retrieveCodingTaskPlastMemContextFromConfig(config, codingTask, {
    ...options,
    onError: (error) => {
      errorMessage = errorMessageFrom(error) ?? String(error)
      options.onError?.(error)
    },
  })

  const injected = !!contextBlock.trim()
  const status: WorkflowPlastMemContextStatus = !config.plastMem.enabled
    ? 'disabled'
    : injected
      ? 'injected'
      : errorMessage
        ? 'unavailable'
        : 'empty'

  return {
    status,
    query,
    contextBlock,
    injected,
    ...(errorMessage ? { error: errorMessage } : {}),
  }
}
