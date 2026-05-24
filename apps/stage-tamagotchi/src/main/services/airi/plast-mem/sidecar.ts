import type { ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'

import type { ElectronPlastMemConfig, ElectronPlastMemSidecarStatus } from '../../../../shared/eventa'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { Mutex } from 'async-mutex'

import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { getElectronMainDirname } from '../../../libs/electron/location'
import { parseBoolean, trimOptional } from '../runtime-config'
import { getPlastMemConfig, hasUserPlastMemConfig, setupPlastMemConfig } from './config'

type PlastMemSidecarProcess = ChildProcessByStdio<null, Readable, Readable>

interface Deferred<T> {
  promise: Promise<T>
  reject: (error?: unknown) => void
  resolve: (value: T | PromiseLike<T>) => void
}

interface PlastMemSidecarLaunchPlan {
  args: string[]
  command: string
  cwd: string
  env: NodeJS.ProcessEnv
}

/**
 * Controls the local Plast Mem Rust sidecar owned by Electron main.
 *
 * Use when:
 * - Renderer settings need to start, stop, or restart the embedded Plast Mem service
 * - Database and OpenAI-compatible provider settings need to be injected into a fresh sidecar process
 *
 * Expects:
 * - Packaged app: `resources/plast-mem/bin/plastmem(.exe)` exists
 * - Dev app: `services/plast-mem/Cargo.toml` exists and Rust/Cargo is available on PATH
 *
 * Returns:
 * - Sidecar lifecycle actions and status snapshots
 */
export interface PlastMemSidecarManager {
  getStatus: () => Promise<ElectronPlastMemSidecarStatus>
  restart: () => Promise<ElectronPlastMemSidecarStatus>
  start: () => Promise<ElectronPlastMemSidecarStatus>
  stop: () => Promise<ElectronPlastMemSidecarStatus>
}

function createDeferred<T>(): Deferred<T> {
  let resolve: Deferred<T>['resolve'] = () => {
    throw new Error('Deferred resolve called before initialization.')
  }
  let reject: Deferred<T>['reject'] = () => {
    throw new Error('Deferred reject called before initialization.')
  }

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return {
    promise,
    reject,
    resolve,
  }
}

function createInitialStatus(): ElectronPlastMemSidecarStatus {
  return {
    databaseUrlConfigured: false,
    external: false,
    pid: null,
    state: 'stopped',
    updatedAt: Date.now(),
  }
}

function resolveSidecarBaseUrl(config: ElectronPlastMemConfig, configuredByUser: boolean) {
  if (configuredByUser)
    return trimOptional(config.baseUrl)

  return trimOptional(process.env.COMPUTER_USE_PLAST_MEM_BASE_URL) ?? trimOptional(config.baseUrl)
}

function statusConfigFields(config: ElectronPlastMemConfig, configuredByUser: boolean) {
  return {
    baseUrl: resolveSidecarBaseUrl(config, configuredByUser),
    databaseUrlConfigured: configuredByUser
      ? Boolean(trimOptional(config.databaseUrl))
      : Boolean(trimOptional(process.env.DATABASE_URL) ?? trimOptional(config.databaseUrl)),
  }
}

function makeUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
}

async function pathExists(path: string) {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

async function isPlastMemDirectory(path: string) {
  return await pathExists(join(path, 'Cargo.toml'))
}

function pushCandidate(candidates: string[], seen: Set<string>, candidate: string | undefined) {
  const normalized = candidate?.trim()
  if (!normalized)
    return

  const resolved = resolve(normalized)
  if (seen.has(resolved))
    return

  seen.add(resolved)
  candidates.push(resolved)
}

function collectPlastMemDirectoryCandidates() {
  const candidates: string[] = []
  const seen = new Set<string>()

  pushCandidate(candidates, seen, process.env.AIRI_PLAST_MEM_DIR)
  pushCandidate(candidates, seen, process.env.AIRI_REPO_ROOT ? join(process.env.AIRI_REPO_ROOT, 'services', 'plast-mem') : undefined)
  pushCandidate(candidates, seen, join(process.cwd(), 'services', 'plast-mem'))
  pushCandidate(candidates, seen, join(process.cwd(), '..', 'plast-mem'))

  if (process.resourcesPath)
    pushCandidate(candidates, seen, join(process.resourcesPath, 'plast-mem'))

  let currentDirectory = getElectronMainDirname()
  while (true) {
    pushCandidate(candidates, seen, join(currentDirectory, 'services', 'plast-mem'))
    pushCandidate(candidates, seen, join(currentDirectory, '..', 'services', 'plast-mem'))

    const parentDirectory = dirname(currentDirectory)
    if (parentDirectory === currentDirectory)
      break

    currentDirectory = parentDirectory
  }

  return candidates
}

async function resolvePlastMemDirectory() {
  const candidates = collectPlastMemDirectoryCandidates()
  for (const candidate of candidates) {
    if (await isPlastMemDirectory(candidate))
      return candidate
  }

  throw new Error(`Unable to locate embedded Plast Mem source. Checked: ${candidates.join(', ')}`)
}

function resolveCargoCommand() {
  return process.platform === 'win32' ? 'cargo.exe' : 'cargo'
}

function resolvePlastMemBinaryName() {
  return process.platform === 'win32' ? 'plastmem.exe' : 'plastmem'
}

function setEnvValue(target: NodeJS.ProcessEnv, key: string, value: string | number | undefined) {
  const normalized = String(value ?? '').trim()
  if (!normalized)
    return

  target[key] = normalized
}

function createSidecarEnv(config: ElectronPlastMemConfig | undefined): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
  }

  if (config) {
    // NOTICE:
    // UI-managed Plast Mem config uses separate chat and embedding providers.
    // Clear inherited shared OpenAI variables so the Rust sidecar cannot fall
    // back to hidden process-level defaults after the user selected split APIs.
    delete childEnv.OPENAI_BASE_URL
    delete childEnv.OPENAI_API_KEY
    setEnvValue(childEnv, 'DATABASE_URL', config.databaseUrl)
    setEnvValue(childEnv, 'OPENAI_CHAT_BASE_URL', config.openaiChatBaseUrl)
    setEnvValue(childEnv, 'OPENAI_CHAT_API_KEY', config.openaiChatApiKey)
    setEnvValue(childEnv, 'OPENAI_CHAT_MODEL', config.openaiChatModel)
    setEnvValue(childEnv, 'OPENAI_CHAT_MAX_TOKENS', config.openaiChatMaxTokens)
    setEnvValue(childEnv, 'OPENAI_EMBEDDING_BASE_URL', config.openaiEmbeddingBaseUrl)
    setEnvValue(childEnv, 'OPENAI_EMBEDDING_API_KEY', config.openaiEmbeddingApiKey)
    setEnvValue(childEnv, 'OPENAI_EMBEDDING_MODEL', config.openaiEmbeddingModel)
    setEnvValue(childEnv, 'OPENAI_REQUEST_TIMEOUT_SECONDS', config.openaiRequestTimeoutSeconds)
  }

  childEnv.OPENAI_CHAT_SEED = trimOptional(process.env.OPENAI_CHAT_SEED) ?? '1145141919810721'
  childEnv.ENABLE_FSRS_REVIEW = trimOptional(process.env.ENABLE_FSRS_REVIEW) ?? 'true'
  childEnv.SQLX_OFFLINE = trimOptional(process.env.SQLX_OFFLINE) ?? 'true'
  // NOTICE:
  // Keep packaged Plast Mem sidecar logs readable in normal desktop runs.
  // The embedded worker emits frequent debug/info traces during recall and
  // consolidation, and Electron forwards stdout/stderr directly to the app log.
  // Users can still override RUST_LOG explicitly when deeper diagnosis is needed.
  childEnv.RUST_LOG = trimOptional(process.env.RUST_LOG) ?? 'plastmem=info,plastmem_worker=warn,plastmem_ai=warn'

  return childEnv
}

async function resolvePackagedPlastMemExecutable() {
  const configured = trimOptional(process.env.AIRI_PLAST_MEM_BIN)
  const binaryName = resolvePlastMemBinaryName()
  const candidates = [
    configured,
    process.resourcesPath ? join(process.resourcesPath, 'plast-mem', 'bin', binaryName) : undefined,
    process.resourcesPath ? join(process.resourcesPath, 'plast-mem', binaryName) : undefined,
  ]

  for (const candidate of candidates) {
    if (candidate && await pathExists(candidate))
      return candidate
  }

  return undefined
}

async function createLaunchPlan(config: ElectronPlastMemConfig, configuredByUser: boolean): Promise<PlastMemSidecarLaunchPlan> {
  const forceSourceSidecar = parseBoolean(process.env.AIRI_PLAST_MEM_FORCE_SOURCE, false)
  if (!forceSourceSidecar) {
    const packagedExecutable = await resolvePackagedPlastMemExecutable()
    if (packagedExecutable) {
      return {
        args: [],
        command: packagedExecutable,
        cwd: dirname(packagedExecutable),
        env: createSidecarEnv(configuredByUser ? config : undefined),
      }
    }
  }

  const cwd = await resolvePlastMemDirectory()
  const command = resolveCargoCommand()

  return {
    args: ['run'],
    command,
    cwd,
    env: createSidecarEnv(configuredByUser ? config : undefined),
  }
}

async function probePlastMem(baseUrl: string, timeoutMsec: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMsec)

  try {
    const response = await fetch(makeUrl(baseUrl, 'openapi.json'), {
      signal: controller.signal,
    })

    return response.ok
  }
  catch {
    return false
  }
  finally {
    clearTimeout(timeout)
  }
}

function sleep(msec: number) {
  return new Promise<void>(resolve => setTimeout(resolve, msec))
}

function signalProcess(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(pid, signal)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH')
      return false

    throw error
  }
}

async function killProcessTree(pid: number, signal: NodeJS.Signals) {
  if (process.platform !== 'win32') {
    if (signalProcess(-pid, signal))
      return

    signalProcess(pid, signal)
    return
  }

  await new Promise<void>((resolvePromise) => {
    const killer = spawn('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    })

    killer.on('close', () => resolvePromise())
    killer.on('error', () => resolvePromise())
  })
}

/**
 * Creates the shared Plast Mem sidecar manager.
 *
 * Call stack:
 *
 * setupPlastMemSidecarManager
 *   -> {@link createPlastMemSidecarManager}
 *     -> renderer invoke handlers
 *       -> Cargo-powered Plast Mem sidecar process
 */
export function createPlastMemSidecarManager(): PlastMemSidecarManager {
  const log = useLogg('main/plast-mem-sidecar').useGlobalConfig()
  const lifecycleMutex = new Mutex()
  let currentStatus = createInitialStatus()
  let currentProcess: PlastMemSidecarProcess | undefined
  let currentProcessExit = createDeferred<void>()
  let expectedProcessExit = false

  function snapshotStatus(config = getPlastMemConfig(), configuredByUser = hasUserPlastMemConfig()): ElectronPlastMemSidecarStatus {
    return {
      ...currentStatus,
      ...statusConfigFields(config, configuredByUser),
    }
  }

  function setStatus(next: Partial<ElectronPlastMemSidecarStatus> & Pick<ElectronPlastMemSidecarStatus, 'state'>) {
    currentStatus = {
      ...currentStatus,
      ...next,
      updatedAt: Date.now(),
    }
  }

  function clearProcessState() {
    currentProcess = undefined
    currentProcessExit.resolve()
    currentProcessExit = createDeferred<void>()
  }

  async function updateExternalReachability(config: ElectronPlastMemConfig, configuredByUser: boolean) {
    const baseUrl = resolveSidecarBaseUrl(config, configuredByUser)
    if (!baseUrl || currentProcess)
      return

    const reachable = await probePlastMem(baseUrl, 900)
    if (reachable) {
      setStatus({
        ...statusConfigFields(config, configuredByUser),
        external: true,
        lastError: undefined,
        pid: null,
        state: 'running',
      })
      return
    }

    if (currentStatus.external || currentStatus.state === 'running') {
      setStatus({
        ...statusConfigFields(config, configuredByUser),
        external: false,
        lastError: undefined,
        pid: null,
        state: 'stopped',
      })
    }
  }

  async function monitorStartup(processHandle: PlastMemSidecarProcess, baseUrl: string) {
    const deadline = Date.now() + 5 * 60_000

    while (Date.now() < deadline) {
      if (currentProcess !== processHandle || currentStatus.state !== 'starting')
        return

      if (await probePlastMem(baseUrl, 1000)) {
        setStatus({
          external: false,
          lastError: undefined,
          pid: processHandle.pid ?? null,
          state: 'running',
        })
        return
      }

      await Promise.race([
        sleep(1000),
        currentProcessExit.promise,
      ]).catch(() => {})
    }

    if (currentProcess === processHandle && currentStatus.state === 'starting') {
      const message = `Plast Mem sidecar did not become reachable at ${baseUrl} within 5 minutes.`
      setStatus({
        lastError: message,
        pid: processHandle.pid ?? null,
        state: 'error',
      })
      await stopActiveProcess(processHandle)
    }
  }

  async function stopActiveProcess(processHandle: PlastMemSidecarProcess, signal: NodeJS.Signals = 'SIGTERM') {
    const pid = processHandle.pid
    if (pid) {
      await killProcessTree(pid, signal)
      return
    }

    processHandle.kill(signal)
  }

  function attachProcessListeners(processHandle: PlastMemSidecarProcess) {
    processHandle.stdout.on('data', (data) => {
      const message = data.toString('utf-8').trim()
      if (message)
        console.info(`[plast-mem] ${message}`)
    })

    processHandle.stderr.on('data', (data) => {
      const message = data.toString('utf-8').trim()
      if (message)
        console.warn(`[plast-mem] ${message}`)
    })

    processHandle.on('error', (error) => {
      if (currentProcess !== processHandle) {
        log.withError(error).debug('ignored stale Plast Mem sidecar process error')
        return
      }

      const message = errorMessageFrom(error) ?? 'Failed to spawn Plast Mem sidecar process.'
      setStatus({
        external: false,
        lastError: message,
        pid: processHandle.pid ?? null,
        state: 'error',
      })
    })

    processHandle.on('close', (code, signal) => {
      if (currentProcess !== processHandle) {
        log.withFields({
          code,
          pid: processHandle.pid ?? null,
          signal,
        }).debug('ignored stale Plast Mem sidecar process close')
        return
      }

      const exitMessage = signal
        ? `Plast Mem sidecar exited with signal ${signal}.`
        : `Plast Mem sidecar exited with code ${code ?? 0}.`

      clearProcessState()

      if (expectedProcessExit) {
        setStatus({
          external: false,
          lastError: undefined,
          pid: null,
          state: 'stopped',
        })
      }
      else {
        setStatus({
          external: false,
          lastError: exitMessage,
          pid: null,
          state: 'error',
        })
      }

      expectedProcessExit = false
    })
  }

  const manager: PlastMemSidecarManager = {
    async getStatus() {
      const config = getPlastMemConfig()
      const configuredByUser = hasUserPlastMemConfig()
      await updateExternalReachability(config, configuredByUser)
      return snapshotStatus()
    },
    async start() {
      return await lifecycleMutex.runExclusive(async () => {
        setupPlastMemConfig()
        const config = getPlastMemConfig()
        const configuredByUser = hasUserPlastMemConfig()

        if (currentProcess)
          return snapshotStatus(config, configuredByUser)

        await updateExternalReachability(config, configuredByUser)
        if (currentStatus.state === 'running')
          return snapshotStatus(config, configuredByUser)

        if (!config.conversationId) {
          const newConversationId = randomUUID()
          log.withFields({ conversationId: newConversationId }).log('auto-generated conversation ID')
          config.conversationId = newConversationId
        }

        const baseUrl = resolveSidecarBaseUrl(config, configuredByUser)
        if (!baseUrl)
          throw new Error('Plast Mem base URL is not configured.')

        const launchPlan = await createLaunchPlan(config, configuredByUser)
        const commandText = [launchPlan.command, ...launchPlan.args].join(' ')

        expectedProcessExit = false
        setStatus({
          ...statusConfigFields(config, configuredByUser),
          command: commandText,
          cwd: launchPlan.cwd,
          external: false,
          lastError: undefined,
          pid: null,
          state: 'starting',
        })

        log.withFields({
          command: commandText,
          cwd: launchPlan.cwd,
          sqlxOffline: launchPlan.env.SQLX_OFFLINE,
        }).log('spawning Plast Mem sidecar')

        const processHandle = spawn(launchPlan.command, launchPlan.args, {
          cwd: launchPlan.cwd,
          detached: process.platform !== 'win32',
          env: launchPlan.env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })

        currentProcess = processHandle
        attachProcessListeners(processHandle)

        setStatus({
          ...statusConfigFields(config, configuredByUser),
          command: commandText,
          cwd: launchPlan.cwd,
          external: false,
          lastError: undefined,
          pid: processHandle.pid ?? null,
          state: 'starting',
        })

        void monitorStartup(processHandle, baseUrl).catch((error) => {
          if (currentProcess !== processHandle)
            return

          setStatus({
            external: false,
            lastError: errorMessageFrom(error) ?? 'Failed while waiting for Plast Mem sidecar startup.',
            pid: processHandle.pid ?? null,
            state: 'error',
          })
        })

        return snapshotStatus(config, configuredByUser)
      })
    },
    async stop() {
      return await lifecycleMutex.runExclusive(async () => {
        if (!currentProcess) {
          setStatus({
            external: false,
            lastError: undefined,
            pid: null,
            state: 'stopped',
          })
          return snapshotStatus()
        }

        const activeProcess = currentProcess
        const exitPromise = currentProcessExit.promise
        expectedProcessExit = true
        setStatus({
          external: false,
          lastError: undefined,
          pid: activeProcess.pid ?? null,
          state: 'stopping',
        })

        await stopActiveProcess(activeProcess)

        await Promise.race([
          exitPromise,
          sleep(5_000),
        ]).catch(() => {})

        if (currentProcess === activeProcess) {
          await stopActiveProcess(activeProcess, 'SIGKILL')
          await Promise.race([
            exitPromise,
            sleep(2_000),
          ]).catch(() => {})
        }

        if (currentProcess === activeProcess) {
          clearProcessState()
          setStatus({
            external: false,
            lastError: undefined,
            pid: null,
            state: 'stopped',
          })
        }

        return snapshotStatus()
      })
    },
    async restart() {
      await manager.stop()
      return await manager.start()
    },
  }

  return manager
}

/**
 * Creates and wires the shared Plast Mem sidecar manager into app lifecycle hooks.
 *
 * Use when:
 * - Electron main needs one app-wide owner for the embedded memory sidecar
 *
 * Expects:
 * - App shutdown to call the registered `onAppBeforeQuit` hook
 *
 * Returns:
 * - The ready-to-use Plast Mem sidecar manager
 */
export function setupPlastMemSidecarManager() {
  setupPlastMemConfig()
  const manager = createPlastMemSidecarManager()

  onAppBeforeQuit(async () => {
    await manager.stop()
  })

  const config = getPlastMemConfig()
  const configuredByUser = hasUserPlastMemConfig()
  const enabled = configuredByUser
    ? config.enabled
    : parseBoolean(process.env.COMPUTER_USE_PLAST_MEM_ENABLED, config.enabled)
  const autoStart = configuredByUser
    ? config.autoStart
    : parseBoolean(process.env.AIRI_PLAST_MEM_AUTO_START, config.autoStart)

  if (enabled && autoStart) {
    void manager.start().catch((error) => {
      console.warn('[plast-mem] sidecar:auto-start:error', errorMessageFrom(error) ?? String(error))
    })
  }

  return manager
}
