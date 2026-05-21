import { readFile } from 'node:fs/promises'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import {
  runCodingPlastMemBridgeSmoke,
} from '../coding-plast-mem-bridge/smoke'

interface SmokeCliOptions {
  input?: string
  baseUrl?: string
  conversationId?: string
  query?: string
  exportedAt?: string
  semanticLimit?: number
  timeoutMs?: number
  maxContextCharacters?: number
  help?: boolean
}

const DEFAULT_QUERY = 'computer-use-mcp plast-mem bridge low authority reviewed coding context'

function usage(): string {
  return [
    'Usage:',
    '  pnpm -F @proj-airi/computer-use-mcp plast-mem:smoke-bridge -- [--input reviewed-memory.json]',
    '  pnpm -F @proj-airi/computer-use-mcp plast-mem:smoke-bridge -- --base-url http://127.0.0.1:3000 --conversation-id UUID --query "task goal"',
    '',
    'Dry-runs reviewed-memory export by default. When base-url and conversation-id are present, also calls plast-mem import_batch_messages and context_pre_retrieve.',
    'base-url and conversation-id may also come from COMPUTER_USE_PLAST_MEM_BASE_URL and COMPUTER_USE_PLAST_MEM_CONVERSATION_ID.',
  ].join('\n')
}

function defaultSamplePath(): string {
  return fileURLToPath(new URL('../../fixtures/plast-mem/reviewed-memory.sample.json', import.meta.url))
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

export function parseSmokeBridgeCliArgs(args: string[]): SmokeCliOptions {
  const options: SmokeCliOptions = {}

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--')
      continue

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    if (arg === '--input') {
      options.input = readOptionValue(args, index, '--input')
      index += 1
      continue
    }
    if (arg.startsWith('--input=')) {
      options.input = arg.slice('--input='.length)
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

    if (arg === '--query') {
      options.query = readOptionValue(args, index, '--query')
      index += 1
      continue
    }
    if (arg.startsWith('--query=')) {
      options.query = arg.slice('--query='.length)
      continue
    }

    if (arg === '--exported-at') {
      options.exportedAt = readOptionValue(args, index, '--exported-at')
      index += 1
      continue
    }
    if (arg.startsWith('--exported-at=')) {
      options.exportedAt = arg.slice('--exported-at='.length)
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
  const options = parseSmokeBridgeCliArgs(process.argv.slice(2))
  if (options.help) {
    console.info(usage())
    return
  }

  const input = options.input ?? defaultSamplePath()
  const reviewedMemoryJson = await readFile(input, 'utf-8')
  const baseUrl = options.baseUrl ?? env.COMPUTER_USE_PLAST_MEM_BASE_URL
  const conversationId = options.conversationId ?? env.COMPUTER_USE_PLAST_MEM_CONVERSATION_ID
  const semanticLimit = options.semanticLimit
    ?? (env.COMPUTER_USE_PLAST_MEM_SEMANTIC_LIMIT ? parseIntegerOption(env.COMPUTER_USE_PLAST_MEM_SEMANTIC_LIMIT, 'COMPUTER_USE_PLAST_MEM_SEMANTIC_LIMIT') : undefined)
  const timeoutMs = options.timeoutMs
    ?? (env.COMPUTER_USE_PLAST_MEM_TIMEOUT_MS ? parseIntegerOption(env.COMPUTER_USE_PLAST_MEM_TIMEOUT_MS, 'COMPUTER_USE_PLAST_MEM_TIMEOUT_MS') : undefined)
  const maxContextCharacters = options.maxContextCharacters
    ?? (env.COMPUTER_USE_PLAST_MEM_MAX_CONTEXT_CHARS ? parseIntegerOption(env.COMPUTER_USE_PLAST_MEM_MAX_CONTEXT_CHARS, 'COMPUTER_USE_PLAST_MEM_MAX_CONTEXT_CHARS') : undefined)

  const result = await runCodingPlastMemBridgeSmoke({
    reviewedMemoryJson,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    baseUrl,
    conversationId,
    query: options.query ?? (baseUrl || conversationId ? DEFAULT_QUERY : undefined),
    semanticLimit,
    timeoutMs,
    maxContextCharacters,
  })

  console.info(JSON.stringify({
    ok: true,
    input,
    mode: baseUrl || conversationId ? 'server' : 'dry-run',
    entryCount: result.entryCount,
    bridgeRecordCount: result.bridgeRecordCount,
    ingestion: result.ingestion,
    retrievedContextCharacters: result.retrievedContextBlock?.length ?? 0,
    retrievedContextReturned: !!result.retrievedContextBlock,
  }, null, 2))

  if (result.retrievedContextBlock) {
    console.info('')
    console.info(result.retrievedContextBlock)
  }
  else if (baseUrl || conversationId) {
    console.info('')
    console.info('No Plast Mem semantic context was returned. If ingestion just ran, background segmentation/consolidation may not have produced semantic facts yet.')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  exit(1)
})
