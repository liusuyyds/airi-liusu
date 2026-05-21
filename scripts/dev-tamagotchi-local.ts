import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import process, { argv, env, exit, platform, stderr, stdout } from 'node:process'

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface PlastMemDevCache {
  conversationId?: string
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const cachePath = resolve(repoRoot, '.cache', 'plast-mem-dev.json')
const plastMemBaseUrl = env.COMPUTER_USE_PLAST_MEM_BASE_URL?.trim() || 'http://127.0.0.1:3000'
const plastMemWorkspaceKey = env.COMPUTER_USE_PLAST_MEM_WORKSPACE_KEY?.trim() || 'airi-main'
const plastMemEnabled = env.COMPUTER_USE_PLAST_MEM_ENABLED?.trim() || 'true'
const plastMemDir = resolvePathFromEnv(env.AIRI_PLAST_MEM_DIR) ?? resolve(repoRoot, '..', 'plast-mem')
const autoStartPlastMem = parseBoolean(env.AIRI_PLAST_MEM_AUTO_START, true)
const useXwayland = argv.includes('--xwayland')
const showHelp = argv.includes('--help') || argv.includes('-h')
const children = new Set<ChildProcessWithoutNullStreams>()
const plastMemServerDefaults = {
  DATABASE_URL: 'postgres://plastmem:plastmem@localhost:5433/plastmem',
  ENABLE_FSRS_REVIEW: 'true',
  OPENAI_API_KEY: 'plastmem',
  OPENAI_BASE_URL: 'http://localhost:11434/v1/',
  OPENAI_CHAT_MAX_TOKENS: '2048',
  OPENAI_CHAT_MODEL: 'qwen3:8b',
  OPENAI_CHAT_SEED: '1145141919810721',
  OPENAI_EMBEDDING_MODEL: 'qwen3-embedding:0.6b',
  OPENAI_REQUEST_TIMEOUT_SECONDS: '120',
}
const plastMemEnvPath = resolve(plastMemDir, '.env')

let shuttingDown = false

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value == null)
    return fallback

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized))
    return true
  if (['0', 'false', 'no', 'off'].includes(normalized))
    return false

  return fallback
}

function resolvePathFromEnv(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed)
    return undefined

  return resolve(repoRoot, trimmed)
}

function commandName(name: string) {
  if (platform !== 'win32')
    return name

  if (name === 'pnpm')
    return 'pnpm.cmd'
  if (name === 'cargo')
    return 'cargo.exe'

  return name
}

function stringifyError(error: unknown) {
  if (error instanceof Error)
    return error.message

  return String(error)
}

async function exists(path: string) {
  try {
    await access(path, constants.F_OK)
    return true
  }
  catch {
    return false
  }
}

async function loadEnvFile(path: string) {
  const values: Record<string, string> = {}

  if (!(await exists(path)))
    return values

  const text = await readFile(path, 'utf-8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#'))
      continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0)
      continue

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\'')))
      value = value.slice(1, -1)

    values[key] = value
  }

  return values
}

async function resolveConversationId() {
  const configured = env.COMPUTER_USE_PLAST_MEM_CONVERSATION_ID?.trim()
  if (configured && uuidPattern.test(configured))
    return configured

  if (configured) {
    console.warn(`[dev] Ignoring invalid COMPUTER_USE_PLAST_MEM_CONVERSATION_ID: ${configured}`)
  }

  try {
    const raw = await readFile(cachePath, 'utf-8')
    const parsed = JSON.parse(raw) as PlastMemDevCache
    if (parsed.conversationId && uuidPattern.test(parsed.conversationId))
      return parsed.conversationId
  }
  catch {
    // Cache is optional; a fresh local UUID is created below.
  }

  const conversationId = randomUUID()
  await mkdir(resolve(cachePath, '..'), { recursive: true })
  await writeFile(cachePath, `${JSON.stringify({ conversationId }, null, 2)}\n`, 'utf-8')
  return conversationId
}

function sanitizeEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const sanitized: Record<string, string> = {}

  for (const [key, value] of Object.entries(source)) {
    if (value == null)
      continue

    if (key.includes('=') || key.includes('\0') || value.includes('\0'))
      continue

    sanitized[key] = value
  }

  return sanitized
}

function childEnv(conversationId: string, plastMemEnv: Record<string, string>): Record<string, string> {
  const getEnv = (key: keyof typeof plastMemServerDefaults) =>
    env[key]?.trim() || plastMemEnv[key]?.trim() || plastMemServerDefaults[key]

  return sanitizeEnv({
    ...env,
    DATABASE_URL: getEnv('DATABASE_URL'),
    ENABLE_FSRS_REVIEW: getEnv('ENABLE_FSRS_REVIEW'),
    OPENAI_API_KEY: getEnv('OPENAI_API_KEY'),
    OPENAI_BASE_URL: getEnv('OPENAI_BASE_URL'),
    OPENAI_CHAT_MAX_TOKENS: getEnv('OPENAI_CHAT_MAX_TOKENS'),
    OPENAI_CHAT_MODEL: getEnv('OPENAI_CHAT_MODEL'),
    OPENAI_CHAT_SEED: getEnv('OPENAI_CHAT_SEED'),
    OPENAI_EMBEDDING_MODEL: getEnv('OPENAI_EMBEDDING_MODEL'),
    OPENAI_REQUEST_TIMEOUT_SECONDS: getEnv('OPENAI_REQUEST_TIMEOUT_SECONDS'),
    AIRI_LOCAL_PLAST_MEM_DEV: '1',
    AIRI_PLAST_MEM_AUTO_START: autoStartPlastMem ? '1' : '0',
    AIRI_PLAST_MEM_DIR: plastMemDir,
    AIRI_REPO_ROOT: repoRoot,
    COMPUTER_USE_PLAST_MEM_BASE_URL: plastMemBaseUrl,
    COMPUTER_USE_PLAST_MEM_CONVERSATION_ID: conversationId,
    COMPUTER_USE_PLAST_MEM_ENABLED: plastMemEnabled,
    COMPUTER_USE_PLAST_MEM_EPISODIC_LIMIT: env.COMPUTER_USE_PLAST_MEM_EPISODIC_LIMIT?.trim() || '4',
    COMPUTER_USE_PLAST_MEM_MAX_CONTEXT_CHARS: env.COMPUTER_USE_PLAST_MEM_MAX_CONTEXT_CHARS?.trim() || '6000',
    COMPUTER_USE_PLAST_MEM_SEMANTIC_LIMIT: env.COMPUTER_USE_PLAST_MEM_SEMANTIC_LIMIT?.trim() || '8',
    COMPUTER_USE_PLAST_MEM_TIMEOUT_MS: env.COMPUTER_USE_PLAST_MEM_TIMEOUT_MS?.trim() || '10000',
    COMPUTER_USE_PLAST_MEM_WORKSPACE_KEY: plastMemWorkspaceKey,
  })
}

function makeUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
}

async function probePlastMem() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1000)

  try {
    await fetch(makeUrl(plastMemBaseUrl, 'openapi.json'), {
      signal: controller.signal,
    })
    return true
  }
  catch {
    return false
  }
  finally {
    clearTimeout(timeout)
  }
}

function pipeOutput(child: ChildProcessWithoutNullStreams, label: string) {
  pipeStream(child.stdout, label, stdout)
  pipeStream(child.stderr, label, stderr)
}

function pipeStream(
  stream: NodeJS.ReadableStream,
  label: string,
  writer: NodeJS.WritableStream,
) {
  let pending = ''

  function flush() {
    if (!pending)
      return

    writer.write(`[${label}] ${pending}\n`)
    pending = ''
  }

  stream.on('data', (chunk) => {
    pending += chunk.toString()
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''

    for (const line of lines)
      writer.write(`[${label}] ${line}\n`)
  })
  stream.on('close', flush)
}

function spawnChild(
  label: string,
  command: string,
  args: string[],
  options: { cwd: string, env: Record<string, string>, required?: boolean },
) {
  console.info(`[dev] Starting ${label}: ${command} ${args.join(' ')}`)
  const spawnTarget = resolveSpawnTarget(command, args)

  const child = spawn(spawnTarget.command, spawnTarget.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: false,
  })

  children.add(child)
  pipeOutput(child, label)

  child.on('error', (error) => {
    children.delete(child)
    console.error(`[dev] ${label} failed to start: ${stringifyError(error)}`)
    if (options.required)
      shutdown(1)
  })

  child.on('exit', (code, signal) => {
    children.delete(child)
    if (shuttingDown)
      return

    const suffix = signal ? `signal ${signal}` : `code ${code ?? 0}`
    if (options.required) {
      console.error(`[dev] ${label} exited with ${suffix}`)
      shutdown(code ?? 1)
    }
    else {
      console.warn(`[dev] ${label} exited with ${suffix}`)
    }
  })

  return child
}

function resolveSpawnTarget(command: string, args: string[]) {
  if (platform !== 'win32' || !/\.(?:bat|cmd)$/i.test(command)) {
    return { command, args }
  }

  return {
    command: env.ComSpec?.trim() || 'cmd.exe',
    args: ['/d', '/s', '/c', command, ...args],
  }
}

function shutdown(code = 0) {
  if (shuttingDown)
    return

  shuttingDown = true
  for (const child of children) {
    child.kill()
  }

  setTimeout(exit, 500, code).unref()
}

async function startPlastMemIfNeeded(processEnv: Record<string, string>) {
  if (!autoStartPlastMem) {
    console.info('[dev] Skipping Plast Mem auto-start because AIRI_PLAST_MEM_AUTO_START=0')
    return
  }

  if (await probePlastMem()) {
    console.info(`[dev] Plast Mem already responds at ${plastMemBaseUrl}; reusing it`)
    return
  }

  const manifestPath = resolve(plastMemDir, 'Cargo.toml')
  if (!(await exists(manifestPath))) {
    console.warn(`[dev] Plast Mem repo not found at ${plastMemDir}; AIRI will still start`)
    return
  }

  spawnChild('plast-mem', commandName('cargo'), ['run'], {
    cwd: plastMemDir,
    env: processEnv,
  })
}

async function main() {
  if (showHelp) {
    console.info('Usage: pnpm dev:tamagotchi [--xwayland]')
    console.info('Starts AIRI Tamagotchi and a local Plast Mem sidecar when needed.')
    return
  }

  const conversationId = await resolveConversationId()
  const plastMemEnv = await loadEnvFile(plastMemEnvPath)
  const processEnv = childEnv(conversationId, plastMemEnv)

  console.info(`[dev] AIRI repo: ${repoRoot}`)
  console.info(`[dev] Plast Mem repo: ${plastMemDir}`)
  console.info(`[dev] Plast Mem URL: ${plastMemBaseUrl}`)
  console.info(`[dev] Plast Mem env: ${await exists(plastMemEnvPath) ? plastMemEnvPath : 'not found; using defaults'}`)
  console.info(`[dev] Plast Mem DB: ${processEnv.DATABASE_URL}`)
  console.info(`[dev] Plast Mem OpenAI base: ${processEnv.OPENAI_BASE_URL}`)
  console.info(`[dev] Plast Mem chat model: ${processEnv.OPENAI_CHAT_MODEL}`)
  console.info(`[dev] Plast Mem chat max tokens: ${processEnv.OPENAI_CHAT_MAX_TOKENS}`)
  console.info(`[dev] Plast Mem embedding model: ${processEnv.OPENAI_EMBEDDING_MODEL}`)
  console.info(`[dev] Plast Mem request timeout: ${processEnv.OPENAI_REQUEST_TIMEOUT_SECONDS}s`)
  console.info(`[dev] Plast Mem episodic recall limit: ${processEnv.COMPUTER_USE_PLAST_MEM_EPISODIC_LIMIT}`)
  console.info(`[dev] Plast Mem semantic recall limit: ${processEnv.COMPUTER_USE_PLAST_MEM_SEMANTIC_LIMIT}`)
  console.info(`[dev] Plast Mem conversation: ${conversationId}`)

  if (
    processEnv.OPENAI_BASE_URL.includes('siliconflow.cn')
    && ['plastmem', 'your_siliconflow_api_key'].includes(processEnv.OPENAI_API_KEY)
  ) {
    console.warn('[dev] Plast Mem is configured for SiliconFlow, but OPENAI_API_KEY still looks like a placeholder. Update plast-mem/.env before testing memory creation.')
  }

  await startPlastMemIfNeeded(processEnv)

  spawnChild(
    'airi',
    commandName('pnpm'),
    ['-rF', '@proj-airi/stage-tamagotchi', 'run', useXwayland ? 'dev:xwayland' : 'dev'],
    {
      cwd: repoRoot,
      env: processEnv,
      required: true,
    },
  )
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

main().catch((error) => {
  console.error(`[dev] ${stringifyError(error)}`)
  shutdown(1)
})
