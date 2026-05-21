import { readFile } from 'node:fs/promises'
import { env, exit } from 'node:process'

import {
  ingestCodingPlastMemBridgeRecords,
  parseCodingPlastMemBridgeRecordsJsonl,
} from '../coding-plast-mem-bridge/plast-mem-ingestion'

interface IngestCliOptions {
  input?: string
  baseUrl?: string
  conversationId?: string
  timeoutMs?: number
  help?: boolean
}

function usage(): string {
  return [
    'Usage:',
    '  pnpm -F @proj-airi/computer-use-mcp plast-mem:ingest-bridge-records -- --input bridge.jsonl --base-url http://127.0.0.1:3000 --conversation-id UUID',
    '',
    'Reads newline-delimited CodingPlastMemBridgeRecordV1 records and posts them to plast-mem import_batch_messages.',
    'base-url and conversation-id may also come from COMPUTER_USE_PLAST_MEM_BASE_URL and COMPUTER_USE_PLAST_MEM_CONVERSATION_ID.',
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

export function parseIngestCliArgs(args: string[]): IngestCliOptions {
  const options: IngestCliOptions = {}

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

    if (arg === '--timeout-ms') {
      options.timeoutMs = parseIntegerOption(readOptionValue(args, index, '--timeout-ms'), '--timeout-ms')
      index += 1
      continue
    }
    if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = parseIntegerOption(arg.slice('--timeout-ms='.length), '--timeout-ms')
      continue
    }

    throw new Error(`unknown option: ${arg}`)
  }

  return options
}

async function main() {
  const options = parseIngestCliArgs(process.argv.slice(2))
  if (options.help) {
    console.info(usage())
    return
  }

  if (!options.input)
    throw new Error(`--input is required\n\n${usage()}`)

  const baseUrl = options.baseUrl ?? env.COMPUTER_USE_PLAST_MEM_BASE_URL
  if (!baseUrl)
    throw new Error(`--base-url is required\n\n${usage()}`)

  const conversationId = options.conversationId ?? env.COMPUTER_USE_PLAST_MEM_CONVERSATION_ID
  if (!conversationId)
    throw new Error(`--conversation-id is required\n\n${usage()}`)

  const timeoutMs = options.timeoutMs
    ?? (env.COMPUTER_USE_PLAST_MEM_TIMEOUT_MS ? parseIntegerOption(env.COMPUTER_USE_PLAST_MEM_TIMEOUT_MS, 'COMPUTER_USE_PLAST_MEM_TIMEOUT_MS') : undefined)
  const source = await readFile(options.input, 'utf-8')
  const records = parseCodingPlastMemBridgeRecordsJsonl(source)
  const result = await ingestCodingPlastMemBridgeRecords(records, {
    baseUrl,
    conversationId,
    timeoutMs,
  })

  console.info(JSON.stringify({
    ok: true,
    count: records.length,
    accepted: result.accepted,
    status: result.status,
  }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  exit(1)
})
