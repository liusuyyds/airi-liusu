import type { Locale } from '@intlify/core'
import type { ServerOptions } from '@proj-airi/server-runtime/server'
import type {
  ShortcutBinding,
  ShortcutRegistrationResult,
} from '@proj-airi/stage-shared/global-shortcut'
import type { ServerChannelQrPayload } from '@proj-airi/stage-shared/server-channel-qr'
import type {
  ThreeHitTestReadTracePayload,
  ThreeSceneRenderInfoTracePayload,
  VrmDisposeEndTracePayload,
  VrmDisposeStartTracePayload,
  VrmLoadEndTracePayload,
  VrmLoadErrorTracePayload,
  VrmLoadStartTracePayload,
  VrmUpdateFrameTracePayload,
} from '@proj-airi/stage-ui-three/trace'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export const electronStartTrackMousePosition = defineInvokeEventa('eventa:invoke:electron:start-tracking-mouse-position')
export const electronStartDraggingWindow = defineInvokeEventa('eventa:invoke:electron:start-dragging-window')

export const electronOpenMainDevtools = defineInvokeEventa('eventa:invoke:electron:windows:main:devtools:open')
export const electronOpenSettings = defineInvokeEventa<void, { route?: string }>('eventa:invoke:electron:windows:settings:open')
export const electronSettingsNavigate = defineEventa<{ route: string }>('eventa:event:electron:windows:settings:navigate')
export const electronOpenChat = defineInvokeEventa('eventa:invoke:electron:windows:chat:open')
export const electronOpenSettingsDevtools = defineInvokeEventa('eventa:invoke:electron:windows:settings:devtools:open')
export const electronOpenDevtoolsWindow = defineInvokeEventa<void, { key: string, route?: string, width?: number, height?: number, x?: number, y?: number }>('eventa:invoke:electron:windows:devtools:open')

export interface ElectronServerChannelConfig {
  tlsConfig?: ServerOptions['tlsConfig'] | null
  authToken: string
  hostname: string
}
export const electronGetServerChannelConfig = defineInvokeEventa<ElectronServerChannelConfig>('eventa:invoke:electron:server-channel:get-config')
export const electronApplyServerChannelConfig = defineInvokeEventa<ElectronServerChannelConfig, Partial<ElectronServerChannelConfig>>('eventa:invoke:electron:server-channel:apply-config')
export const electronGetServerChannelQrPayload = defineInvokeEventa<ServerChannelQrPayload>('eventa:invoke:electron:server-channel:get-qr-payload')

export type ElectronUpdaterChannel = 'latest' | 'stable' | 'alpha' | 'beta' | 'nightly' | 'canary'

export interface ElectronUpdaterPreferences {
  channel?: ElectronUpdaterChannel
}

export const electronGetUpdaterPreferences = defineInvokeEventa<ElectronUpdaterPreferences>('eventa:invoke:electron:auto-updater:get-preferences')
export const electronSetUpdaterPreferences = defineInvokeEventa<ElectronUpdaterPreferences, ElectronUpdaterPreferences>('eventa:invoke:electron:auto-updater:set-preferences')

export * from './plugin/assets'
export * from './plugin/capabilities'
export * from './plugin/host'
export * from './plugin/tools'

export interface DesktopOverlayReadiness {
  state: 'booting' | 'ready' | 'degraded'
  error?: string
}

export const getDesktopOverlayReadinessContract = defineInvokeEventa<DesktopOverlayReadiness>('eventa:invoke:electron:windows:desktop-overlay:get-readiness')

export const captionIsFollowingWindowChanged = defineEventa<boolean>('eventa:event:electron:windows:caption-overlay:is-following-window-changed')
export const captionGetIsFollowingWindow = defineInvokeEventa<boolean>('eventa:invoke:electron:windows:caption-overlay:get-is-following-window')

export type RequestWindowActionDefault = 'confirm' | 'cancel' | 'close'
export interface RequestWindowPayload {
  id?: string
  route: string
  type?: string
  payload?: Record<string, any>
}
export interface RequestWindowPending {
  id: string
  type?: string
  payload?: Record<string, any>
}

// Reference window helpers are generic; callers can alias for clarity
export type NoticeAction = 'confirm' | 'cancel' | 'close'

export function createRequestWindowEventa(namespace: string) {
  const prefix = (name: string) => `eventa:${name}:electron:windows:${namespace}`
  return {
    openWindow: defineInvokeEventa<boolean, RequestWindowPayload>(prefix('invoke:open')),
    windowAction: defineInvokeEventa<void, { id: string, action: RequestWindowActionDefault }>(prefix('invoke:action')),
    pageMounted: defineInvokeEventa<RequestWindowPending | undefined, { id?: string }>(prefix('invoke:page-mounted')),
    pageUnmounted: defineInvokeEventa<void, { id?: string }>(prefix('invoke:page-unmounted')),
  }
}

// Notice window events built from generic factory
export const noticeWindowEventa = createRequestWindowEventa('notice')

// Widgets / Adhoc window events
export interface WidgetWindowSize {
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}

export type WidgetGridSize = 's' | 'm' | 'l' | { cols?: number, rows?: number }

export interface WidgetsAddPayload {
  id?: string
  componentName: string
  componentProps?: Record<string, any>
  // size presets or explicit spans; renderer decides mapping
  size?: WidgetGridSize
  windowSize?: WidgetWindowSize | Record<string, unknown>
  // auto-dismiss in ms; if omitted, persistent until closed by user
  ttlMs?: number
}

export interface WidgetsUpdatePayload {
  id: string
  componentProps?: Record<string, any>
  size?: WidgetGridSize
  windowSize?: WidgetWindowSize | Record<string, unknown>
  ttlMs?: number
}

export interface WidgetSnapshot {
  id: string
  componentName: string
  componentProps: Record<string, any>
  size: WidgetGridSize
  windowSize?: WidgetWindowSize
  ttlMs: number
}

export interface PluginManifestSummary {
  name: string
  entrypoints: Record<string, string | undefined>
  path: string
  enabled: boolean
  loaded: boolean
  isNew: boolean
}

export interface PluginRegistrySnapshot {
  root: string
  plugins: PluginManifestSummary[]
}

// TODO: Replace these manually duplicated IPC types with re-exports from
// @proj-airi/plugin-sdk (CapabilityDescriptor) once stage-ui and the shared
// eventa layer can depend on the SDK without introducing unwanted coupling.
export interface PluginCapabilityPayload {
  key: string
  state: 'announced' | 'ready' | 'degraded' | 'withdrawn'
  metadata?: Record<string, unknown>
}

export interface PluginCapabilityState {
  key: string
  state: 'announced' | 'ready' | 'degraded' | 'withdrawn'
  metadata?: Record<string, unknown>
  updatedAt: number
}

export interface PluginHostSessionSummary {
  id: string
  manifestName: string
  phase: string
  runtime: 'electron' | 'node' | 'web'
  moduleId: string
}

export interface PluginHostDebugSnapshot {
  registry: PluginRegistrySnapshot
  sessions: PluginHostSessionSummary[]
  capabilities: PluginCapabilityState[]
  refreshedAt: number
}

export interface ElectronMcpStdioServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled?: boolean
}

export interface ElectronMcpStdioConfigFile {
  mcpServers: Record<string, ElectronMcpStdioServerConfig>
}

export interface ElectronMcpStdioApplyResult {
  path: string
  started: Array<{ name: string }>
  failed: Array<{ name: string, error: string }>
  skipped: Array<{ name: string, reason: string }>
}

export interface ElectronMcpStdioServerRuntimeStatus {
  name: string
  state: 'running' | 'stopped' | 'error'
  command: string
  args: string[]
  pid: number | null
  lastError?: string
}

export interface ElectronMcpStdioRuntimeStatus {
  path: string
  servers: ElectronMcpStdioServerRuntimeStatus[]
  updatedAt: number
}

export interface ElectronMcpToolDescriptor {
  serverName: string
  name: string
  toolName: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface ElectronMcpCallToolPayload {
  name: string
  arguments?: Record<string, unknown>
}

export interface ElectronMcpCallToolResult {
  content?: Array<Record<string, unknown>>
  structuredContent?: Record<string, unknown>
  toolResult?: unknown
  isError?: boolean
}

export interface ElectronMcpStdioConfigText {
  path: string
  text: string
}

export interface ElectronMcpStdioTestResult {
  ok: boolean
  error?: string
  tools?: string[]
  durationMs: number
}

export interface ElectronMcpStdioTestPayload {
  name: string
  config: ElectronMcpStdioServerConfig
}

export const electronMcpOpenConfigFile = defineInvokeEventa<{ path: string }>('eventa:invoke:electron:mcp:open-config-file')
export const electronMcpApplyAndRestart = defineInvokeEventa<ElectronMcpStdioApplyResult>('eventa:invoke:electron:mcp:apply-and-restart')
export const electronMcpGetRuntimeStatus = defineInvokeEventa<ElectronMcpStdioRuntimeStatus>('eventa:invoke:electron:mcp:get-runtime-status')
export const electronMcpListTools = defineInvokeEventa<ElectronMcpToolDescriptor[]>('eventa:invoke:electron:mcp:list-tools')
export const electronMcpCallTool = defineInvokeEventa<ElectronMcpCallToolResult, ElectronMcpCallToolPayload>('eventa:invoke:electron:mcp:call-tool')
export const electronMcpReadConfigText = defineInvokeEventa<ElectronMcpStdioConfigText>('eventa:invoke:electron:mcp:read-config-text')
export const electronMcpWriteConfigText = defineInvokeEventa<ElectronMcpStdioConfigText, { text: string }>('eventa:invoke:electron:mcp:write-config-text')
export const electronMcpTestServer = defineInvokeEventa<ElectronMcpStdioTestResult, ElectronMcpStdioTestPayload>('eventa:invoke:electron:mcp:test-server')

export interface ElectronPlastMemConfig {
  autoStart: boolean
  baseUrl: string
  category: string
  conversationId: string
  databaseUrl: string
  enabled: boolean
  enableChatIngest: boolean
  enableChatRetrieve: boolean
  enableContextPreRetrieve: boolean
  enableRecentMemory: boolean
  episodicLimit: number
  maxContextCharacters: number
  openaiApiKey: string
  openaiBaseUrl: string
  openaiChatApiKey: string
  openaiChatBaseUrl: string
  openaiChatMaxTokens: number
  openaiChatModel: string
  openaiEmbeddingApiKey: string
  openaiEmbeddingBaseUrl: string
  openaiEmbeddingModel: string
  openaiRequestTimeoutSeconds: number
  requestTimeoutMsec: number
  semanticLimit: number
  workspaceKey: string
}

export type ElectronPlastMemApplyConfigPayload = Partial<ElectronPlastMemConfig>

export const defaultElectronPlastMemConfig: ElectronPlastMemConfig = {
  autoStart: false,
  baseUrl: 'http://127.0.0.1:3000',
  category: '',
  conversationId: '',
  databaseUrl: 'postgres://plastmem:plastmem@localhost:5433/plastmem',
  enabled: false,
  enableChatIngest: true,
  enableChatRetrieve: true,
  enableContextPreRetrieve: true,
  enableRecentMemory: true,
  episodicLimit: 4,
  maxContextCharacters: 5000,
  openaiApiKey: '',
  openaiBaseUrl: '',
  openaiChatApiKey: '',
  openaiChatBaseUrl: 'https://api.z.ai/api/paas/v4/',
  openaiChatMaxTokens: 2048,
  openaiChatModel: 'Qwen/Qwen3.5-9B',
  openaiEmbeddingApiKey: '',
  openaiEmbeddingBaseUrl: 'https://api.siliconflow.cn/v1/',
  openaiEmbeddingModel: 'Qwen/Qwen3-Embedding-0.6B',
  openaiRequestTimeoutSeconds: 120,
  requestTimeoutMsec: 10000,
  semanticLimit: 12,
  workspaceKey: 'airi-main',
}

export interface ElectronPlastMemRuntimeStatus {
  autoStart: boolean
  baseUrl?: string
  chatDiagnostics?: ElectronPlastMemChatDiagnostics
  checkedAt: number
  configuredByUser: boolean
  conversationIdConfigured: boolean
  databaseUrlConfigured: boolean
  devMode: boolean
  enabled: boolean
  error?: string
  mcpServer?: ElectronMcpStdioServerRuntimeStatus
  openaiApiKeyConfigured: boolean
  openaiBaseUrlConfigured: boolean
  openaiChatApiKeyConfigured?: boolean
  openaiChatBaseUrlConfigured?: boolean
  openaiChatModel?: string
  openaiEmbeddingApiKeyConfigured?: boolean
  openaiEmbeddingBaseUrlConfigured?: boolean
  openaiEmbeddingModel?: string
  reachable: boolean
  statusCode?: number
  workspaceKey?: string
}

export interface ElectronPlastMemHealthCounts {
  active_semantic_memories: number
  conversation_messages: number
  episode_spans: number
  episodic_memories: number
  pending_reviews: number
  semantic_memories: number
}

export interface ElectronPlastMemHealthPayload {
  ownerId?: string
}

export interface ElectronPlastMemHealthResult {
  baseUrl?: string
  conversationId?: string
  counts?: ElectronPlastMemHealthCounts
  databaseError?: string
  databaseOk: boolean
  enabled: boolean
  error?: string
  serverTime?: string
  statusCode?: number
}

export type ElectronPlastMemSidecarState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'

export interface ElectronPlastMemSidecarStatus {
  baseUrl?: string
  command?: string
  cwd?: string
  databaseUrlConfigured: boolean
  external: boolean
  lastError?: string
  pid: number | null
  state: ElectronPlastMemSidecarState
  updatedAt: number
}

export const electronPlastMemGetConfig = defineInvokeEventa<ElectronPlastMemConfig>('eventa:invoke:electron:plast-mem:get-config')
export const electronPlastMemApplyConfig = defineInvokeEventa<ElectronPlastMemConfig, ElectronPlastMemApplyConfigPayload>('eventa:invoke:electron:plast-mem:apply-config')
export const electronPlastMemGetRuntimeStatus = defineInvokeEventa<ElectronPlastMemRuntimeStatus>('eventa:invoke:electron:plast-mem:get-runtime-status')
export const electronPlastMemGetSidecarStatus = defineInvokeEventa<ElectronPlastMemSidecarStatus>('eventa:invoke:electron:plast-mem:sidecar:get-status')
export const electronPlastMemStartSidecar = defineInvokeEventa<ElectronPlastMemSidecarStatus>('eventa:invoke:electron:plast-mem:sidecar:start')
export const electronPlastMemStopSidecar = defineInvokeEventa<ElectronPlastMemSidecarStatus>('eventa:invoke:electron:plast-mem:sidecar:stop')
export const electronPlastMemRestartSidecar = defineInvokeEventa<ElectronPlastMemSidecarStatus>('eventa:invoke:electron:plast-mem:sidecar:restart')

export type ElectronPlastMemContextDetail = 'auto' | 'none' | 'low' | 'high'
export type ElectronPlastMemRecallStatus = 'idle' | 'recalled' | 'empty' | 'error'
export type ElectronPlastMemIngestStatus = 'idle' | 'accepted' | 'rejected' | 'error'
export type ElectronPlastMemContextSource = 'retrieve' | 'preRetrieve' | 'recent'

export interface ElectronPlastMemRecallDiagnostics {
  at?: number
  baseUrl?: string
  contextBlock?: string
  contextCharacters?: number
  error?: string
  queryCharacters?: number
  status: ElectronPlastMemRecallStatus
  statusCode?: number
}

export interface ElectronPlastMemContextDiagnostics extends ElectronPlastMemRecallDiagnostics {
  source: ElectronPlastMemContextSource
}

export interface ElectronPlastMemIngestDiagnostics {
  at?: number
  baseUrl?: string
  error?: string
  messageCount?: number
  status: ElectronPlastMemIngestStatus
  statusCode?: number
}

export interface ElectronPlastMemChatDiagnostics {
  contexts?: ElectronPlastMemContextDiagnostics[]
  ingest: ElectronPlastMemIngestDiagnostics
  recall: ElectronPlastMemRecallDiagnostics
}

export interface ElectronPlastMemChatBridgeLeasePayload {
  ownerId: string
}

export interface ElectronPlastMemChatBridgeLeaseResult {
  acquired: boolean
  activeOwnerId?: string
}

export interface ElectronPlastMemRetrieveChatContextPayload {
  category?: string
  detail?: ElectronPlastMemContextDetail
  ownerId?: string
  query: string
  queryEmbedding?: number[]
  semanticLimit?: number
}

export interface ElectronPlastMemRetrieveChatContextResult {
  baseUrl?: string
  contextBlock: string
  enabled: boolean
  error?: string
  recalled: boolean
  statusCode?: number
}

export interface ElectronPlastMemChatMessage {
  role: string
  content: string
  timestamp?: number | string
}

export interface ElectronPlastMemIngestChatMessagesPayload {
  messages: ElectronPlastMemChatMessage[]
  ownerId?: string
}

export interface ElectronPlastMemIngestChatMessagesResult {
  accepted: boolean
  enabled: boolean
  error?: string
  statusCode?: number
}

export interface ElectronPlastMemContextPreRetrievePayload {
  category?: string
  detail?: ElectronPlastMemContextDetail
  ownerId?: string
  query: string
  queryEmbedding?: number[]
  semanticLimit?: number
}

export interface ElectronPlastMemContextPreRetrieveResult {
  baseUrl?: string
  contextBlock: string
  enabled: boolean
  error?: string
  recalled: boolean
  statusCode?: number
}

export interface ElectronPlastMemRecentMemoryPayload {
  ownerId?: string
  daysLimit?: number
  limit?: number
}

export interface ElectronPlastMemRecentMemoryResult {
  baseUrl?: string
  contextBlock: string
  enabled: boolean
  error?: string
  recalled: boolean
  statusCode?: number
}

export interface ElectronPlastMemEpisodicMemory {
  id: string
  conversation_id: string
  title: string
  content: string
  start_at?: string
  end_at?: string
  created_at: string
  last_reviewed_at?: string
  consolidated_at?: string | null
  stability?: number
  difficulty?: number
  surprise?: number
  classification?: string | null
}

export interface ElectronPlastMemRecentMemoryRawPayload {
  ownerId?: string
  daysLimit?: number
  limit?: number
}

export interface ElectronPlastMemRecentMemoryRawResult {
  baseUrl?: string
  memories: ElectronPlastMemEpisodicMemory[]
  enabled: boolean
  error?: string
  statusCode?: number
}

export interface ElectronPlastMemSemanticMemory {
  id: string
  conversation_id: string
  category: string
  fact: string
  source_episodic_ids: string[]
  valid_at: string
  invalid_at?: string | null
  created_at: string
}

export interface ElectronPlastMemSemanticMemoryRawPayload {
  category?: string
  includeInvalid?: boolean
  limit?: number
  ownerId?: string
}

export interface ElectronPlastMemSemanticMemoryRawResult {
  baseUrl?: string
  enabled: boolean
  error?: string
  memories: ElectronPlastMemSemanticMemory[]
  statusCode?: number
}

export interface ElectronPlastMemSetSemanticMemoryInvalidPayload {
  invalid: boolean
  memoryId: string
  ownerId?: string
}

export interface ElectronPlastMemSetSemanticMemoryInvalidResult {
  baseUrl?: string
  enabled: boolean
  error?: string
  memory?: ElectronPlastMemSemanticMemory
  statusCode?: number
}

export interface ElectronPlastMemScoredSemanticMemory extends ElectronPlastMemSemanticMemory {
  score: number
}

export interface ElectronPlastMemScoredEpisodicMemory extends ElectronPlastMemEpisodicMemory {
  score: number
}

export interface ElectronPlastMemRetrieveMemoryRawPayload {
  category?: string
  detail?: ElectronPlastMemContextDetail
  episodicLimit?: number
  ownerId?: string
  query: string
  queryEmbedding?: number[]
  semanticLimit?: number
}

export interface ElectronPlastMemRetrieveMemoryRawResult {
  baseUrl?: string
  enabled: boolean
  episodic: ElectronPlastMemScoredEpisodicMemory[]
  error?: string
  semantic: ElectronPlastMemScoredSemanticMemory[]
  statusCode?: number
}

export const electronPlastMemHealth = defineInvokeEventa<ElectronPlastMemHealthResult, ElectronPlastMemHealthPayload>('eventa:invoke:electron:plast-mem:health')
export const electronPlastMemRetrieveChatContext = defineInvokeEventa<ElectronPlastMemRetrieveChatContextResult, ElectronPlastMemRetrieveChatContextPayload>('eventa:invoke:electron:plast-mem:retrieve-chat-context')
export const electronPlastMemRetrieveMemoryRaw = defineInvokeEventa<ElectronPlastMemRetrieveMemoryRawResult, ElectronPlastMemRetrieveMemoryRawPayload>('eventa:invoke:electron:plast-mem:retrieve-memory-raw')
export const electronPlastMemContextPreRetrieve = defineInvokeEventa<ElectronPlastMemContextPreRetrieveResult, ElectronPlastMemContextPreRetrievePayload>('eventa:invoke:electron:plast-mem:context-pre-retrieve')
export const electronPlastMemRecentMemory = defineInvokeEventa<ElectronPlastMemRecentMemoryResult, ElectronPlastMemRecentMemoryPayload>('eventa:invoke:electron:plast-mem:recent-memory')
export const electronPlastMemRecentMemoryRaw = defineInvokeEventa<ElectronPlastMemRecentMemoryRawResult, ElectronPlastMemRecentMemoryRawPayload>('eventa:invoke:electron:plast-mem:recent-memory-raw')
export const electronPlastMemSemanticMemoryRaw = defineInvokeEventa<ElectronPlastMemSemanticMemoryRawResult, ElectronPlastMemSemanticMemoryRawPayload>('eventa:invoke:electron:plast-mem:semantic-memory-raw')
export const electronPlastMemSetSemanticMemoryInvalid = defineInvokeEventa<ElectronPlastMemSetSemanticMemoryInvalidResult, ElectronPlastMemSetSemanticMemoryInvalidPayload>('eventa:invoke:electron:plast-mem:semantic-memory:set-invalid')
export const electronPlastMemIngestChatMessages = defineInvokeEventa<ElectronPlastMemIngestChatMessagesResult, ElectronPlastMemIngestChatMessagesPayload>('eventa:invoke:electron:plast-mem:ingest-chat-messages')
export interface ElectronPlastMemAddMessagePayload {
  content: string
  ownerId?: string
  role: 'assistant' | 'user'
  timestamp?: number
}

export interface ElectronPlastMemAddMessageResult {
  accepted: boolean
  enabled: boolean
  error?: string
  statusCode?: number
}

export const electronPlastMemAddMessage = defineInvokeEventa<ElectronPlastMemAddMessageResult, ElectronPlastMemAddMessagePayload>('eventa:invoke:electron:plast-mem:add-message')
export const electronPlastMemAcquireChatBridge = defineInvokeEventa<ElectronPlastMemChatBridgeLeaseResult, ElectronPlastMemChatBridgeLeasePayload>('eventa:invoke:electron:plast-mem:acquire-chat-bridge')
export const electronPlastMemReleaseChatBridge = defineInvokeEventa<void, ElectronPlastMemChatBridgeLeasePayload>('eventa:invoke:electron:plast-mem:release-chat-bridge')

export const widgetsOpenWindow = defineInvokeEventa<void, { id?: string }>('eventa:invoke:electron:windows:widgets:open')
export const widgetsHideWindow = defineInvokeEventa<void, { id?: string }>('eventa:invoke:electron:windows:widgets:hide')
export const widgetsAdd = defineInvokeEventa<string | undefined, WidgetsAddPayload>('eventa:invoke:electron:windows:widgets:add')
export const widgetsRemove = defineInvokeEventa<void, { id: string }>('eventa:invoke:electron:windows:widgets:remove')
export const widgetsClear = defineInvokeEventa('eventa:invoke:electron:windows:widgets:clear')
export const widgetsUpdate = defineInvokeEventa<void, WidgetsUpdatePayload>('eventa:invoke:electron:windows:widgets:update')
export const widgetsFetch = defineInvokeEventa<WidgetSnapshot | void, { id: string }>('eventa:invoke:electron:windows:widgets:fetch')
export const widgetsPrepareWindow = defineInvokeEventa<string | undefined, { id?: string }>('eventa:invoke:electron:windows:widgets:prepare')
export const widgetsIframePublish = defineInvokeEventa<void, { id: string, event: Record<string, unknown> }>('eventa:invoke:electron:windows:widgets:iframe-publish')

export const electronWindowClose = defineInvokeEventa<void>('eventa:invoke:electron:window:close')
export type ElectronWindowLifecycleReason
  = | 'initial'
    | 'snapshot'
    | 'show'
    | 'hide'
    | 'minimize'
    | 'restore'
    | 'focus'
    | 'blur'

export interface ElectronWindowLifecycleState {
  focused: boolean
  minimized: boolean
  reason: ElectronWindowLifecycleReason
  updatedAt: number
  visible: boolean
}

export const electronWindowLifecycleChanged = defineEventa<ElectronWindowLifecycleState>('eventa:event:electron:window:lifecycle-changed')
export const electronGetWindowLifecycleState = defineInvokeEventa<ElectronWindowLifecycleState>('eventa:invoke:electron:window:get-lifecycle-state')
export const electronWindowSetAlwaysOnTop = defineInvokeEventa<void, boolean>('eventa:invoke:electron:window:set-always-on-top')
export const electronAppOpenUserDataFolder = defineInvokeEventa<{ path: string }>('eventa:invoke:electron:app:open-user-data-folder')
export const electronAppQuit = defineInvokeEventa<void>('eventa:invoke:electron:app:quit')

export type ElectronGodotStageState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'

/**
 * Snapshot of the Godot sidecar lifecycle owned by Electron main.
 *
 * Use when:
 * - Renderer windows need to reflect whether the external Godot window is available
 * - Settings or stage pages need lifecycle feedback after start/stop actions
 *
 * Expects:
 * - `pid` is only set while the Godot child process exists
 * - `lastError` is present for the most recent lifecycle or scene-apply failure
 *
 * Returns:
 * - N/A
 */
export interface ElectronGodotStageStatus {
  state: ElectronGodotStageState
  pid: number | null
  lastError?: string
  updatedAt: number
}

/**
 * Serialized scene input payload forwarded from renderer to Electron main.
 *
 * Use when:
 * - The selected model should be materialized to disk and applied to the Godot scene
 *
 * Expects:
 * - `data` contains the full model file bytes
 * - `fileName` matches the original model asset name when available
 *
 * Returns:
 * - N/A
 */
export interface ElectronGodotStageSceneInputPayload {
  modelId: string
  format: 'vrm'
  name: string
  fileName: string
  data: Uint8Array
}

export const electronGodotStageStart = defineInvokeEventa<ElectronGodotStageStatus>('eventa:invoke:electron:godot-stage:start')
export const electronGodotStageStop = defineInvokeEventa<ElectronGodotStageStatus>('eventa:invoke:electron:godot-stage:stop')
export const electronGodotStageGetStatus = defineInvokeEventa<ElectronGodotStageStatus>('eventa:invoke:electron:godot-stage:get-status')
export const electronGodotStageApplySceneInput = defineInvokeEventa<void, ElectronGodotStageSceneInputPayload>('eventa:invoke:electron:godot-stage:apply-scene-input')
export const electronGodotStageStatusChanged = defineEventa<ElectronGodotStageStatus>('eventa:event:electron:godot-stage:status-changed')

// Global shortcut ->

/**
 * Phase of a shortcut trigger event.
 *
 * - `down` — key combination pressed
 * - `up`   — key combination released; only emitted by drivers that
 *            accepted a binding with `receiveKeyUps: true`
 */
export type ElectronShortcutTriggerPhase = 'down' | 'up'

/**
 * Payload broadcast to all subscribed windows when a registered shortcut
 * fires. Renderer composables filter by `id` to dispatch local handlers.
 */
export interface ElectronShortcutTriggerPayload {
  id: string
  phase: ElectronShortcutTriggerPhase
}

export const electronShortcutRegister = defineInvokeEventa<ShortcutRegistrationResult, ShortcutBinding>('eventa:invoke:electron:shortcut:register')
export const electronShortcutUnregister = defineInvokeEventa<void, { id: string }>('eventa:invoke:electron:shortcut:unregister')
export const electronShortcutUnregisterAll = defineInvokeEventa<void>('eventa:invoke:electron:shortcut:unregister-all')
export const electronShortcutList = defineInvokeEventa<ShortcutBinding[]>('eventa:invoke:electron:shortcut:list')
export const electronShortcutTriggered = defineEventa<ElectronShortcutTriggerPayload>('eventa:event:electron:shortcut:triggered')

// <- Global shortcut

export type StageThreeRuntimeTraceEnvelope
  = | { type: 'three-render-info', payload: ThreeSceneRenderInfoTracePayload }
    | { type: 'three-hit-test-read', payload: ThreeHitTestReadTracePayload }
    | { type: 'vrm-update-frame', payload: VrmUpdateFrameTracePayload }
    | { type: 'vrm-load-start', payload: VrmLoadStartTracePayload }
    | { type: 'vrm-load-end', payload: VrmLoadEndTracePayload }
    | { type: 'vrm-load-error', payload: VrmLoadErrorTracePayload }
    | { type: 'vrm-dispose-start', payload: VrmDisposeStartTracePayload }
    | { type: 'vrm-dispose-end', payload: VrmDisposeEndTracePayload }

export interface StageThreeRuntimeTraceForwardedPayload {
  envelope: StageThreeRuntimeTraceEnvelope
  origin: string
}

export interface StageThreeRuntimeTraceRemoteControlPayload {
  origin: string
}

export const stageThreeRuntimeTraceForwardedEvent = defineEventa<StageThreeRuntimeTraceForwardedPayload>('eventa:event:stage-three-runtime-trace:forwarded')
export const stageThreeRuntimeTraceRemoteEnableEvent = defineEventa<StageThreeRuntimeTraceRemoteControlPayload>('eventa:event:stage-three-runtime-trace:remote-enable')
export const stageThreeRuntimeTraceRemoteDisableEvent = defineEventa<StageThreeRuntimeTraceRemoteControlPayload>('eventa:event:stage-three-runtime-trace:remote-disable')

// Internal event from main -> widgets renderer when a widget should render
export const widgetsRenderEvent = defineEventa<WidgetSnapshot>('eventa:event:electron:windows:widgets:render')
export const widgetsRemoveEvent = defineEventa<{ id: string }>('eventa:event:electron:windows:widgets:remove')
export const widgetsClearEvent = defineEventa('eventa:event:electron:windows:widgets:clear')
export const widgetsUpdateEvent = defineEventa<WidgetsUpdatePayload>('eventa:event:electron:windows:widgets:update')

// Onboarding window events
export const electronOnboardingClose = defineInvokeEventa('eventa:invoke:electron:windows:onboarding:close')
export const electronOpenOnboarding = defineInvokeEventa('eventa:invoke:electron:windows:onboarding:open')

// Auth — OIDC Authorization Code + PKCE flow via system browser
export interface ElectronAuthTokens {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresIn: number
}
export const electronAuthStartLogin = defineInvokeEventa<void>('eventa:invoke:electron:auth:start-login')
export const electronAuthCallback = defineEventa<ElectronAuthTokens>('eventa:event:electron:auth:callback')
export const electronAuthCallbackError = defineEventa<{ error: string }>('eventa:event:electron:auth:callback-error')
export const electronAuthLogout = defineInvokeEventa<void>('eventa:invoke:electron:auth:logout')

export const i18nSetLocale = defineInvokeEventa<void, Locale>('eventa:invoke:electron:i18n:set-locale')
export const i18nGetLocale = defineInvokeEventa<string | undefined>('eventa:invoke:electron:i18n:get-locale')

export { electron } from '@proj-airi/electron-eventa'
export * from '@proj-airi/electron-eventa/electron-updater'
