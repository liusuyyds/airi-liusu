import { env, exit, stdout } from 'node:process'

import {
  buildCodingTaskPlastMemRetrievalQuery,
} from '../coding-plast-mem-bridge/coding-task-context'
import {
  retrievePlastMemReviewedContextBlock,
} from '../coding-plast-mem-bridge/plast-mem-retrieval'

interface RetrieveCliOptions {
  baseUrl?: string
  conversationId?: string
  query?: string
  taskGoal?: string
  workspaceKey?: string
  projectPath?: string
  relatedFiles?: string[]
  commands?: string[]
  semanticLimit?: number
  timeoutMs?: number
  maxContextCharacters?: number
  help?: boolean
}

function usage(): string {
  return [
    'Usage:',
    '  pnpm -F @proj-airi/computer-use-mcp plast-mem:pre-retrieve-context -- --query "task goal" --base-url http://127.0.0.1:3000 --conversation-id UUID',
    '  pnpm -F @proj-airi/computer-use-mcp plast-mem:pre-retrieve-context -- --task "task goal" --workspace-key airi-main --file services/computer-use-mcp/src/config.ts',
    '',
    'Calls plast-mem context_pre_retrieve and prints the bounded low-authority context block.',
    'Use --query for exact retrieval text, or --task plus optional workspace/file/command metadata for coding-task retrieval.',
    'base-url and conversation-id may also come from COMPUTER_USE_PLAST_MEM_BASE_URL and COMPUTER_USE_PLAST_MEM_CONVERSATION_ID.',
    'workspace-key may also come from COMPUTER_USE_PLAST_MEM_WORKSPACE_KEY.',
  ].join('\n')
}

function readOptionValue(args: string[], index: number, name: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--'))
    throw new Error(`${name} requires a value`)
  return value
}

function parseIntegerOption(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`)
  return parsed
}

export function parseRetrieveContextCliArgs(args: string[]): RetrieveCliOptions {
  const options: RetrieveCliOptions = {}

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--')
      continue

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    if (arg === '--query') {
      options.query = readOptionValue(args, index, '--query')
      index += 1
      continue
    }
    if (arg.startsWith('--query=')) {
      options.query = arg.slice('--query='.length)
      continue
    }

    if (arg === '--task') {
      options.taskGoal = readOptionValue(args, index, '--task')
      index += 1
      continue
    }
    if (arg.startsWith('--task=')) {
      options.taskGoal = arg.slice('--task='.length)
      continue
    }

    if (arg === '--workspace-key') {
      options.workspaceKey = readOptionValue(args, index, '--workspace-key')
      index += 1
      continue
    }
    if (arg.startsWith('--workspace-key=')) {
      options.workspaceKey = arg.slice('--workspace-key='.length)
      continue
    }

    if (arg === '--project-path') {
      options.projectPath = readOptionValue(args, index, '--project-path')
      index += 1
      continue
    }
    if (arg.startsWith('--project-path=')) {
      options.projectPath = arg.slice('--project-path='.length)
      continue
    }

    if (arg === '--file') {
      options.relatedFiles ??= []
      options.relatedFiles.push(readOptionValue(args, index, '--file'))
      index += 1
      continue
    }
    if (arg.startsWith('--file=')) {
      options.relatedFiles ??= []
      options.relatedFiles.push(arg.slice('--file='.length))
      continue
    }

    if (arg === '--command') {
      options.commands ??= []
      options.commands.push(readOptionValue(args, index, '--command'))
      index += 1
      continue
    }
    if (arg.startsWith('--command=')) {
      options.commands ??= []
      options.commands.push(arg.slice('--command='.length))
      continue
    }

    if (arg === '--base-url') {
      options.baseUrl = readOptionValue(args, index, '--base-url')
      index += 1
      continue
    }
    if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length)
      continue
    }

    if (arg === '--conversation-id') {
      options.conversationId = readOptionValue(args, index, '--conversation-id')
      index += 1
      continue
    }
    if (arg.startsWith('--conversation-id=')) {
      options.conversationId = arg.slice('--conversation-id='.length)
      continue
    }

    if (arg === '--semantic-limit') {
      options.semanticLimit = parseIntegerOption(readOptionValue(args, index, '--semantic-limit'), '--semantic-limit')
      index += 1
      continue
    }
    if (arg.startsWith('--semantic-limit=')) {
      options.semanticLimit = parseIntegerOption(arg.slice('--semantic-limit='.length), '--semantic-limit')
      continue
    }

    if (arg === '--timeout-ms') {
      options.timeoutMs = parseIntegerOption(readOptionValue(args, index, '--timeout-ms'), '--timeout-ms')
      index += 1
      continue
    }
    if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = parseIntegerOption(arg.slice('--timeout-ms='.length), '--timeout-ms')
      continue
    }

    if (arg === '--max-context-chars') {
      options.maxContextCharacters = parseIntegerOption(readOptionValue(args, index, '--max-context-chars'), '--max-context-chars')
      index += 1
      continue
    }
    if (arg.startsWith('--max-context-chars=')) {
      options.maxContextCharacters = parseIntegerOption(arg.slice('--max-context-chars='.length), '--max-context-chars')
      continue
    }

    throw new Error(`unknown option: ${arg}`)
  }

  return options
}

async function main() {
  const options = parseRetrieveContextCliArgs(process.argv.slice(2))
  if (options.help) {
    console.info(usage())
    return
  }

  const query = options.query ?? (options.taskGoal
    ? buildCodingTaskPlastMemRetrievalQuery({
        taskGoal: options.taskGoal,
        workspaceKey: options.workspaceKey ?? env.COMPUTER_USE_PLAST_MEM_WORKSPACE_KEY,
        projectPath: options.projectPath,
        relatedFiles: options.relatedFiles,
        commands: options.commands,
      })
    : undefined)

  if (!query)
    throw new Error(`--query or --task is required\n\n${usage()}`)

  const baseUrl = options.baseUrl ?? env.COMPUTER_USE_PLAST_MEM_BASE_URL
  if (!baseUrl)
    throw new Error(`--base-url is required\n\n${usage()}`)

  const conversationId = options.conversationId ?? env.COMPUTER_USE_PLAST_MEM_CONVERSATION_ID
  if (!conversationId)
    throw new Error(`--conversation-id is required\n\n${usage()}`)

  const semanticLimit = options.semanticLimit
    ?? (env.COMPUTER_USE_PLAST_MEM_SEMANTIC_LIMIT ? parseIntegerOption(env.COMPUTER_USE_PLAST_MEM_SEMANTIC_LIMIT, 'COMPUTER_USE_PLAST_MEM_SEMANTIC_LIMIT') : undefined)
  const timeoutMs = options.timeoutMs
    ?? (env.COMPUTER_USE_PLAST_MEM_TIMEOUT_MS ? parseIntegerOption(env.COMPUTER_USE_PLAST_MEM_TIMEOUT_MS, 'COMPUTER_USE_PLAST_MEM_TIMEOUT_MS') : undefined)
  const maxCharacters = options.maxContextCharacters
    ?? (env.COMPUTER_USE_PLAST_MEM_MAX_CONTEXT_CHARS ? parseIntegerOption(env.COMPUTER_USE_PLAST_MEM_MAX_CONTEXT_CHARS, 'COMPUTER_USE_PLAST_MEM_MAX_CONTEXT_CHARS') : undefined)

  const block = await retrievePlastMemReviewedContextBlock({
    baseUrl,
    conversationId,
    query,
    semanticLimit,
    timeoutMs,
    maxCharacters,
  })

  if (block)
    stdout.write(`${block}\n`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  exit(1)
})
