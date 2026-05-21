import { readFile } from 'node:fs/promises'
import { exit, stdout } from 'node:process'

import {
  buildCodingPlastMemBridgeJsonl,
  parseReviewedCodingMemoryEntriesJson,
  writeCodingPlastMemBridgeJsonlFile,
} from '../coding-plast-mem-bridge/local-export'

interface ExportCliOptions {
  input?: string
  output?: string
  exportedAt?: string
  help?: boolean
}

function usage(): string {
  return [
    'Usage:',
    '  pnpm -F @proj-airi/computer-use-mcp plast-mem:export-reviewed-memory -- --input reviewed-memory.json [--output bridge.jsonl] [--exported-at ISO_DATE]',
    '',
    'Input must be a JSON array, or an object with an entries array, of human-reviewed coding memory entries.',
    'When --output is omitted, JSONL is written to stdout.',
  ].join('\n')
}

function readOptionValue(args: string[], index: number, name: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--'))
    throw new Error(`${name} requires a value`)
  return value
}

export function parseExportCliArgs(args: string[]): ExportCliOptions {
  const options: ExportCliOptions = {}

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

    if (arg === '--output') {
      options.output = readOptionValue(args, index, '--output')
      index += 1
      continue
    }
    if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length)
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

    throw new Error(`unknown option: ${arg}`)
  }

  return options
}

async function main() {
  const options = parseExportCliArgs(process.argv.slice(2))
  if (options.help) {
    console.info(usage())
    return
  }

  if (!options.input)
    throw new Error(`--input is required\n\n${usage()}`)

  const source = await readFile(options.input, 'utf-8')
  const entries = parseReviewedCodingMemoryEntriesJson(source)
  const jsonl = buildCodingPlastMemBridgeJsonl(entries, {
    exportedAt: options.exportedAt ?? new Date().toISOString(),
  })

  if (options.output) {
    await writeCodingPlastMemBridgeJsonlFile(options.output, jsonl)
    console.info(JSON.stringify({
      ok: true,
      count: entries.length,
      output: options.output,
    }))
    return
  }

  stdout.write(jsonl)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  exit(1)
})
