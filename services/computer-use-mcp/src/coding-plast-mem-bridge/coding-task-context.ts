import type { ComputerUseConfig } from '../types'
import type { PlastMemContextFetch } from './plast-mem-retrieval'

import {
  tryRetrievePlastMemReviewedContextBlockFromConfig,
} from './plast-mem-retrieval'

export interface CodingTaskPlastMemContextInput {
  taskGoal: string
  workspaceKey?: string
  projectPath?: string
  relatedFiles?: readonly string[]
  commands?: readonly string[]
}

export interface BuildCodingTaskPlastMemQueryOptions {
  maxRelatedFiles?: number
  maxCommands?: number
  maxCharacters?: number
}

export interface RetrieveCodingTaskPlastMemContextOptions extends BuildCodingTaskPlastMemQueryOptions {
  fetchImpl?: PlastMemContextFetch
  onError?: (error: unknown) => void
}

export interface RetrieveCodingTaskPlastMemContextResult {
  query: string
  contextBlock: string
}

const DEFAULT_MAX_RELATED_FILES = 12
const DEFAULT_MAX_COMMANDS = 6
const DEFAULT_MAX_QUERY_CHARACTERS = 2000

function normalizeNonBlank(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized || undefined
}

function normalizeUniqueValues(values: readonly string[] | undefined, limit: number): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values ?? []) {
    const normalized = normalizeNonBlank(value)
    if (!normalized || seen.has(normalized))
      continue
    seen.add(normalized)
    result.push(normalized)
    if (result.length >= limit)
      break
  }

  return result
}

function boundQuery(query: string, maxCharacters: number): string {
  if (query.length <= maxCharacters)
    return query

  return `${query.slice(0, Math.max(0, maxCharacters - 15)).trimEnd()}\n[truncated]`
}

export function buildCodingTaskPlastMemRetrievalQuery(
  input: CodingTaskPlastMemContextInput,
  options: BuildCodingTaskPlastMemQueryOptions = {},
): string {
  const taskGoal = normalizeNonBlank(input.taskGoal)
  if (!taskGoal)
    throw new Error('taskGoal is required for coding plast-mem retrieval')

  const maxRelatedFiles = options.maxRelatedFiles ?? DEFAULT_MAX_RELATED_FILES
  const maxCommands = options.maxCommands ?? DEFAULT_MAX_COMMANDS
  const maxCharacters = options.maxCharacters ?? DEFAULT_MAX_QUERY_CHARACTERS
  const relatedFiles = normalizeUniqueValues(input.relatedFiles, maxRelatedFiles)
  const commands = normalizeUniqueValues(input.commands, maxCommands)

  const lines = [
    'Coding task long-term memory pre-retrieval query.',
    `Task goal: ${taskGoal}`,
    normalizeNonBlank(input.workspaceKey) ? `Workspace key: ${normalizeNonBlank(input.workspaceKey)}` : undefined,
    normalizeNonBlank(input.projectPath) ? `Project path: ${normalizeNonBlank(input.projectPath)}` : undefined,
    relatedFiles.length ? `Relevant files: ${relatedFiles.join(', ')}` : undefined,
    commands.length ? `Validation or workflow commands: ${commands.join(' ; ')}` : undefined,
    'Return reviewed project context, prior pitfalls, constraints, commands, and file notes relevant to this task.',
  ].filter((line): line is string => typeof line === 'string')

  return boundQuery(lines.join('\n'), maxCharacters)
}

export async function retrieveCodingTaskPlastMemContextFromConfig(
  config: Pick<ComputerUseConfig, 'plastMem'>,
  input: CodingTaskPlastMemContextInput,
  options: RetrieveCodingTaskPlastMemContextOptions = {},
): Promise<RetrieveCodingTaskPlastMemContextResult> {
  const query = buildCodingTaskPlastMemRetrievalQuery({
    ...input,
    workspaceKey: input.workspaceKey ?? config.plastMem.workspaceKey,
  }, options)
  const contextBlock = await tryRetrievePlastMemReviewedContextBlockFromConfig(config, query, {
    fetchImpl: options.fetchImpl,
    onError: options.onError,
  })

  return {
    query,
    contextBlock,
  }
}
