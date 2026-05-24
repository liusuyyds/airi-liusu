<script setup lang="ts">
import type {
  ChatHistoryItem,
} from '@proj-airi/stage-ui/types/chat'

import type {
  ElectronPlastMemChatMessage,
  ElectronPlastMemConfig,
  ElectronPlastMemEpisodicMemory,
  ElectronPlastMemHealthResult,
  ElectronPlastMemRetrieveMemoryRawResult,
  ElectronPlastMemRuntimeStatus,
  ElectronPlastMemSemanticMemory,
  ElectronPlastMemSidecarStatus,
} from '../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { Button, Callout, Collapsible, FieldCheckbox, FieldInput, Input } from '@proj-airi/ui'
import { useDebounceFn } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  defaultElectronPlastMemConfig,
  electronPlastMemApplyConfig,
  electronPlastMemGetConfig,
  electronPlastMemGetRuntimeStatus,
  electronPlastMemGetSidecarStatus,
  electronPlastMemHealth,
  electronPlastMemIngestChatMessages,
  electronPlastMemRecentMemoryRaw,
  electronPlastMemRestartSidecar,
  electronPlastMemRetrieveMemoryRaw,
  electronPlastMemSemanticMemoryRaw,
  electronPlastMemSetSemanticMemoryInvalid,
  electronPlastMemStartSidecar,
  electronPlastMemStopSidecar,
} from '../../../../shared/eventa'

type BridgeStatusKind = 'checking' | 'disabled' | 'offline' | 'online'
type ConnectionCheckKind = 'error' | 'ok' | 'unknown'
type ConfigSaveSyncMode = 'always' | 'ifStable' | 'never'
type DetailPanelId = 'config' | 'runtime' | 'diagnostics' | 'tools' | 'semantic' | 'recent' | 'health' | 'about'

interface ConfigSaveOptions {
  refreshAfterSave: boolean
  showSavedMessage: boolean
  syncDraft: ConfigSaveSyncMode
}

const { t } = useI18n()
const tn = (key: string, params?: Record<string, unknown>) => t(`settings.pages.modules.memory-long-term.sections.plast-mem-bridge.${key}`, params ?? {})

const invokeGetPlastMemConfig = useElectronEventaInvoke(electronPlastMemGetConfig)
const invokeApplyPlastMemConfig = useElectronEventaInvoke(electronPlastMemApplyConfig)
const invokeGetPlastMemRuntimeStatus = useElectronEventaInvoke(electronPlastMemGetRuntimeStatus)
const invokeGetPlastMemSidecarStatus = useElectronEventaInvoke(electronPlastMemGetSidecarStatus)
const invokeStartPlastMemSidecar = useElectronEventaInvoke(electronPlastMemStartSidecar)
const invokeStopPlastMemSidecar = useElectronEventaInvoke(electronPlastMemStopSidecar)
const invokeRestartPlastMemSidecar = useElectronEventaInvoke(electronPlastMemRestartSidecar)
const invokePlastMemHealth = useElectronEventaInvoke(electronPlastMemHealth)
const invokeIngestChatMessages = useElectronEventaInvoke(electronPlastMemIngestChatMessages)
const invokeRecentMemoryRaw = useElectronEventaInvoke(electronPlastMemRecentMemoryRaw)
const invokeRetrieveMemoryRaw = useElectronEventaInvoke(electronPlastMemRetrieveMemoryRaw)
const invokeSemanticMemoryRaw = useElectronEventaInvoke(electronPlastMemSemanticMemoryRaw)
const invokeSetSemanticMemoryInvalid = useElectronEventaInvoke(electronPlastMemSetSemanticMemoryInvalid)
const chatSessionStore = useChatSessionStore()

const bridgeFacts = [
  {
    icon: 'i-solar:verified-check-bold-duotone',
    titleKey: 'settings.pages.modules.memory-long-term.sections.plast-mem-bridge.facts.reviewed.title',
    descriptionKey: 'settings.pages.modules.memory-long-term.sections.plast-mem-bridge.facts.reviewed.description',
  },
  {
    icon: 'i-solar:database-bold-duotone',
    titleKey: 'settings.pages.modules.memory-long-term.sections.plast-mem-bridge.facts.external.title',
    descriptionKey: 'settings.pages.modules.memory-long-term.sections.plast-mem-bridge.facts.external.description',
  },
  {
    icon: 'i-solar:shield-warning-bold-duotone',
    titleKey: 'settings.pages.modules.memory-long-term.sections.plast-mem-bridge.facts.low-authority.title',
    descriptionKey: 'settings.pages.modules.memory-long-term.sections.plast-mem-bridge.facts.low-authority.description',
  },
]

const bridgeEnvVars = [
  'COMPUTER_USE_PLAST_MEM_ENABLED',
  'COMPUTER_USE_PLAST_MEM_BASE_URL',
  'COMPUTER_USE_PLAST_MEM_CONVERSATION_ID',
  'COMPUTER_USE_PLAST_MEM_WORKSPACE_KEY',
  'COMPUTER_USE_PLAST_MEM_CONTEXT_PRE_RETRIEVE_ENABLED',
  'COMPUTER_USE_PLAST_MEM_CHAT_RETRIEVE_ENABLED',
  'COMPUTER_USE_PLAST_MEM_RECENT_MEMORY_ENABLED',
  'COMPUTER_USE_PLAST_MEM_CHAT_INGEST_ENABLED',
  'COMPUTER_USE_PLAST_MEM_SEMANTIC_LIMIT',
  'COMPUTER_USE_PLAST_MEM_MAX_CONTEXT_CHARS',
  'COMPUTER_USE_PLAST_MEM_TIMEOUT_MS',
  'DATABASE_URL',
  'OPENAI_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_CHAT_MODEL',
  'OPENAI_EMBEDDING_MODEL',
  'OPENAI_CHAT_MAX_TOKENS',
  'OPENAI_REQUEST_TIMEOUT_SECONDS',
]

const configDraft = ref<ElectronPlastMemConfig>({ ...defaultElectronPlastMemConfig })
const configError = ref('')
const configSavedMessage = ref('')
const isLoadingConfig = ref(false)
const isSavingConfig = ref(false)
const isTestingConnection = ref(false)
const apiKeyVisible = ref(false)
const advancedConfigVisible = ref(false)
const status = ref<ElectronPlastMemRuntimeStatus>()
const statusError = ref('')
const isRefreshing = ref(false)
const sidecarStatus = ref<ElectronPlastMemSidecarStatus>()
const sidecarError = ref('')
const isRefreshingSidecar = ref(false)
const isStartingSidecar = ref(false)
const isStoppingSidecar = ref(false)
const isRestartingSidecar = ref(false)
const health = ref<ElectronPlastMemHealthResult>()
const healthError = ref('')
const isCheckingHealth = ref(false)
const recentMemories = ref<ElectronPlastMemEpisodicMemory[]>([])
const recentMemoriesError = ref('')
const isLoadingRecentMemories = ref(false)
const semanticMemories = ref<ElectronPlastMemSemanticMemory[]>([])
const semanticMemoriesError = ref('')
const isLoadingSemanticMemories = ref(false)
const mutatingSemanticMemoryId = ref('')
const includeInvalidSemanticMemories = ref(false)
const manualImportMessageLimit = ref(20)
const manualImportMessage = ref('')
const manualImportError = ref('')
const isManualImporting = ref(false)
const previewQuery = ref('')
const previewResult = ref<ElectronPlastMemRetrieveMemoryRawResult>()
const previewError = ref('')
const isPreviewingRecall = ref(false)
const selectedSourceMemoryIds = ref<string[]>([])
const activeDetailPanel = ref<DetailPanelId>('config')
let refreshTimer: ReturnType<typeof setInterval> | undefined
let activeSavePromise: Promise<boolean> | undefined
let pendingConfigSave = false
let pendingConfigRefreshAfterSave = false
let pendingConfigShowSavedMessage = false
let pendingConfigSyncDraft: ConfigSaveSyncMode = 'never'
let suppressConfigAutoSave = false
let configDraftRevision = 0

const statusKind = computed<BridgeStatusKind>(() => {
  if (!status.value)
    return 'checking'
  if (!status.value.enabled)
    return 'disabled'
  return status.value.reachable ? 'online' : 'offline'
})

const statusBadgeClass = computed(() => {
  const classes: Record<BridgeStatusKind, string> = {
    checking: 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300',
    disabled: 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300',
    offline: 'bg-red-500/15 text-red-700 dark:text-red-300',
    online: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  }

  return classes[statusKind.value]
})

const mcpServerStatus = computed(() => status.value?.mcpServer?.state)
const mcpServerLabel = computed(() => {
  const state = mcpServerStatus.value
  if (!state)
    return tn('runtime.mcp.missing')

  return tn(`runtime.mcp.${state}`)
})

const mcpServerBadgeClass = computed(() => {
  if (mcpServerStatus.value === 'running')
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if (mcpServerStatus.value === 'error')
    return 'bg-red-500/15 text-red-700 dark:text-red-300'

  return 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300'
})

const checkedAt = computed(() => {
  if (!status.value)
    return '-'

  return new Date(status.value.checkedAt).toLocaleTimeString()
})

const recallDiagnostics = computed(() => status.value?.chatDiagnostics?.recall ?? { status: 'idle' as const })
const ingestDiagnostics = computed(() => status.value?.chatDiagnostics?.ingest ?? { status: 'idle' as const })
const contextDiagnostics = computed(() => status.value?.chatDiagnostics?.contexts ?? [])
const apiKeyInputType = computed(() => apiKeyVisible.value ? 'text' : 'password')
const recallStatusBadgeClass = computed(() => chatAttemptBadgeClass(recallDiagnostics.value.status))
const ingestStatusBadgeClass = computed(() => chatAttemptBadgeClass(ingestDiagnostics.value.status))
const recallStatusLabel = computed(() => tn(`chat-diagnostics.recall.status.${recallDiagnostics.value.status}`))
const ingestStatusLabel = computed(() => tn(`chat-diagnostics.ingest.status.${ingestDiagnostics.value.status}`))
const recallContextPreview = computed(() => recallDiagnostics.value.contextBlock?.trim() ?? '')
const hasRecallContextPreview = computed(() => recallContextPreview.value.length > 0)
const advancedConfigSummary = computed(() => [
  tn('config.fields.conversation-id.label'),
  tn('config.fields.workspace-key.label'),
  tn('config.fields.request-timeout-msec.label'),
].join(' / '))
const normalizedManualImportMessageLimit = computed(() => Math.max(1, Number(manualImportMessageLimit.value) || 20))
const importableChatMessages = computed(() => chatSessionStore.messages
  .map(toPlastMemChatMessage)
  .filter((message): message is ElectronPlastMemChatMessage => Boolean(message))
  .slice(-normalizedManualImportMessageLimit.value))
const selectedSourceMemories = computed(() => recentMemories.value.filter(memory => selectedSourceMemoryIds.value.includes(memory.id)))
const missingSourceMemoryIds = computed(() => selectedSourceMemoryIds.value.filter(id => !selectedSourceMemories.value.some(memory => memory.id === id)))
const sidecarState = computed(() => sidecarStatus.value?.state ?? 'stopped')
const sidecarStatusLabel = computed(() => {
  if (sidecarStatus.value?.external)
    return tn('runtime.sidecar.status.external')

  return tn(`runtime.sidecar.status.${sidecarState.value}`)
})
const sidecarStatusBadgeClass = computed(() => {
  if (sidecarStatus.value?.external)
    return 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
  if (sidecarState.value === 'running')
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if (sidecarState.value === 'starting' || sidecarState.value === 'stopping')
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  if (sidecarState.value === 'error')
    return 'bg-red-500/15 text-red-700 dark:text-red-300'

  return 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300'
})
const sidecarCanStart = computed(() => !['starting', 'running', 'stopping'].includes(sidecarState.value))
const sidecarCanStop = computed(() => Boolean(sidecarStatus.value?.pid) && ['starting', 'running'].includes(sidecarState.value))
const sidecarCanRestart = computed(() => !sidecarStatus.value?.external && sidecarState.value !== 'stopping')
const healthServiceOk = computed(() => Boolean(health.value && !health.value.error))
const healthCheckedAt = computed(() => health.value?.serverTime ? new Date(health.value.serverTime).toLocaleTimeString() : '-')
const healthServiceBadgeClass = computed(() => healthStatusBadgeClass(healthServiceOk.value ? true : health.value ? false : undefined))
const healthDatabaseBadgeClass = computed(() => healthStatusBadgeClass(health.value?.databaseOk))
const healthCounts = computed(() => health.value?.counts)
const pendingReviewCount = computed(() => healthCounts.value?.pending_reviews ?? 0)
const connectionChecks = computed<Array<{ detail: string, icon: string, kind: ConnectionCheckKind, label: string }>>(() => [
  {
    detail: status.value?.error ?? status.value?.baseUrl ?? tn('config.test.details.service'),
    icon: 'i-solar:server-square-bold-duotone',
    kind: status.value ? (status.value.reachable ? 'ok' : 'error') : 'unknown',
    label: tn('config.test.items.service'),
  },
  {
    detail: health.value?.databaseError ?? (health.value ? tn('config.test.details.database') : tn('config.test.details.waiting')),
    icon: 'i-solar:database-bold-duotone',
    kind: health.value ? (health.value.databaseOk ? 'ok' : 'error') : 'unknown',
    label: tn('config.test.items.database'),
  },
  {
    detail: health.value?.conversationId ?? status.value?.workspaceKey ?? tn('config.test.details.conversation'),
    icon: 'i-solar:dialog-2-bold-duotone',
    kind: status.value ? (status.value.conversationIdConfigured ? 'ok' : 'error') : 'unknown',
    label: tn('config.test.items.conversation'),
  },
  {
    detail: status.value?.openaiChatModel ?? status.value?.openaiEmbeddingModel ?? tn('config.test.details.models'),
    icon: 'i-solar:cpu-bold-duotone',
    kind: status.value
      ? (status.value.openaiBaseUrlConfigured && status.value.openaiApiKeyConfigured && Boolean(status.value.openaiChatModel) && Boolean(status.value.openaiEmbeddingModel) ? 'ok' : 'error')
      : 'unknown',
    label: tn('config.test.items.models'),
  },
  {
    detail: sidecarStatus.value?.lastError ?? sidecarStatusLabel.value,
    icon: 'i-solar:restart-bold-duotone',
    kind: sidecarStatus.value ? (sidecarStatus.value.external || sidecarStatus.value.state === 'running' ? 'ok' : 'error') : 'unknown',
    label: tn('config.test.items.sidecar'),
  },
])
const detailPanelOptions = computed<Array<{ icon: string, label: string, value: DetailPanelId }>>(() => [
  {
    icon: 'i-solar:tuning-square-bold-duotone',
    label: tn('panels.config'),
    value: 'config',
  },
  {
    icon: 'i-solar:pulse-2-bold-duotone',
    label: tn('panels.runtime'),
    value: 'runtime',
  },
  {
    icon: 'i-solar:chat-round-dots-bold-duotone',
    label: tn('panels.diagnostics'),
    value: 'diagnostics',
  },
  {
    icon: 'i-solar:toolbox-bold-duotone',
    label: tn('panels.tools'),
    value: 'tools',
  },
  {
    icon: 'i-solar:document-add-bold-duotone',
    label: tn('panels.semantic'),
    value: 'semantic',
  },
  {
    icon: 'i-solar:brain-bold-duotone',
    label: tn('panels.recent'),
    value: 'recent',
  },
  {
    icon: 'i-solar:shield-check-bold-duotone',
    label: tn('panels.health'),
    value: 'health',
  },
  {
    icon: 'i-solar:info-circle-bold-duotone',
    label: tn('panels.about'),
    value: 'about',
  },
])
const recallDetail = computed(() => {
  if (recallDiagnostics.value.status === 'recalled') {
    return tn('chat-diagnostics.recall.detail.recalled', {
      characters: recallDiagnostics.value.contextCharacters ?? 0,
    })
  }
  if (recallDiagnostics.value.status === 'error') {
    return tn('chat-diagnostics.recall.detail.error', {
      error: recallDiagnostics.value.error ?? '-',
    })
  }

  return tn(`chat-diagnostics.recall.detail.${recallDiagnostics.value.status}`)
})
const ingestDetail = computed(() => {
  if (ingestDiagnostics.value.status === 'accepted') {
    return tn('chat-diagnostics.ingest.detail.accepted', {
      count: ingestDiagnostics.value.messageCount ?? 0,
    })
  }
  if (ingestDiagnostics.value.status === 'error') {
    return tn('chat-diagnostics.ingest.detail.error', {
      error: ingestDiagnostics.value.error ?? '-',
    })
  }

  return tn(`chat-diagnostics.ingest.detail.${ingestDiagnostics.value.status}`)
})

function chatAttemptBadgeClass(state: string) {
  if (state === 'recalled' || state === 'accepted')
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if (state === 'empty')
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  if (state === 'error' || state === 'rejected')
    return 'bg-red-500/15 text-red-700 dark:text-red-300'

  return 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300'
}

function healthStatusBadgeClass(ok: boolean | undefined) {
  if (ok === true)
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if (ok === false)
    return 'bg-red-500/15 text-red-700 dark:text-red-300'

  return 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300'
}

function connectionCheckBadgeClass(kind: ConnectionCheckKind) {
  if (kind === 'ok')
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if (kind === 'error')
    return 'bg-red-500/15 text-red-700 dark:text-red-300'

  return 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300'
}

function connectionCheckStatusLabel(kind: ConnectionCheckKind) {
  return tn(`config.test.status.${kind}`)
}

function hasRecordShape(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function textFromUnknown(value: unknown): string {
  if (typeof value === 'string')
    return value
  if (Array.isArray(value))
    return value.map(textFromUnknown).filter(Boolean).join('\n')
  if (!hasRecordShape(value))
    return ''

  if (typeof value.text === 'string')
    return value.text
  if (typeof value.content === 'string')
    return value.content
  if (Array.isArray(value.slices))
    return textFromUnknown(value.slices)

  return ''
}

function toPlastMemChatMessage(message: ChatHistoryItem): ElectronPlastMemChatMessage | undefined {
  if (message.role !== 'user' && message.role !== 'assistant')
    return undefined

  const content = textFromUnknown(message).trim()
  if (!content)
    return undefined

  const createdAt = hasRecordShape(message) && typeof message.createdAt === 'number'
    ? message.createdAt
    : undefined

  return {
    content,
    role: message.role,
    ...(createdAt ? { timestamp: createdAt } : {}),
  }
}

function formatAttemptTime(value: number | undefined) {
  if (!value)
    return tn('chat-diagnostics.never')

  return new Date(value).toLocaleTimeString()
}

function mergeConfigSaveSyncMode(current: ConfigSaveSyncMode, next: ConfigSaveSyncMode): ConfigSaveSyncMode {
  if (current === 'always' || next === 'always')
    return 'always'
  if (current === 'ifStable' || next === 'ifStable')
    return 'ifStable'
  return 'never'
}

async function replaceConfigDraft(config: ElectronPlastMemConfig) {
  suppressConfigAutoSave = true
  configDraft.value = config
  await nextTick()
  suppressConfigAutoSave = false
}

async function refreshConfig() {
  if (isLoadingConfig.value)
    return

  isLoadingConfig.value = true
  configError.value = ''
  try {
    await replaceConfigDraft(await invokeGetPlastMemConfig())
  }
  catch (error) {
    configError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    isLoadingConfig.value = false
  }
}

async function saveConfig(options: ConfigSaveOptions) {
  if (isSavingConfig.value) {
    pendingConfigSave = true
    pendingConfigRefreshAfterSave ||= options.refreshAfterSave
    pendingConfigShowSavedMessage ||= options.showSavedMessage
    pendingConfigSyncDraft = mergeConfigSaveSyncMode(pendingConfigSyncDraft, options.syncDraft)
    return await (activeSavePromise ?? Promise.resolve(false))
  }

  activeSavePromise = (async () => {
    isSavingConfig.value = true
    configError.value = ''
    configSavedMessage.value = ''
    let shouldRefreshAfterSave = options.refreshAfterSave
    let shouldShowSavedMessage = options.showSavedMessage
    let syncDraftMode = options.syncDraft
    try {
      do {
        pendingConfigSave = false
        shouldRefreshAfterSave ||= pendingConfigRefreshAfterSave
        shouldShowSavedMessage ||= pendingConfigShowSavedMessage
        syncDraftMode = mergeConfigSaveSyncMode(syncDraftMode, pendingConfigSyncDraft)
        pendingConfigRefreshAfterSave = false
        pendingConfigShowSavedMessage = false
        pendingConfigSyncDraft = 'never'

        const saveRevision = configDraftRevision
        const savedConfig = await invokeApplyPlastMemConfig({ ...configDraft.value })
        const shouldSyncDraft = syncDraftMode === 'always'
          || (syncDraftMode === 'ifStable' && !pendingConfigSave && saveRevision === configDraftRevision)

        if (shouldSyncDraft)
          await replaceConfigDraft(savedConfig)
      } while (pendingConfigSave)

      if (shouldShowSavedMessage)
        configSavedMessage.value = tn('config.saved')
      if (shouldRefreshAfterSave) {
        await refreshStatus()
        await refreshSidecarStatus()
        await refreshHealth()
      }
      return true
    }
    catch (error) {
      configError.value = errorMessageFrom(error) ?? 'Unknown error'
      return false
    }
    finally {
      isSavingConfig.value = false
      activeSavePromise = undefined
    }
  })()

  return await activeSavePromise
}

async function testConnection(saveBeforeTest: boolean) {
  if (isTestingConnection.value)
    return

  isTestingConnection.value = true
  configError.value = ''
  configSavedMessage.value = ''
  try {
    if (saveBeforeTest) {
      const saved = await saveConfig({
        refreshAfterSave: false,
        showSavedMessage: false,
        syncDraft: 'always',
      })
      if (!saved)
        return
    }

    await Promise.all([
      refreshStatus(),
      refreshSidecarStatus(),
      refreshHealth(),
    ])
    if (saveBeforeTest)
      configSavedMessage.value = tn('config.test.complete')
  }
  finally {
    isTestingConnection.value = false
  }
}

async function refreshStatus() {
  if (isRefreshing.value)
    return

  isRefreshing.value = true
  statusError.value = ''
  try {
    status.value = await invokeGetPlastMemRuntimeStatus()
  }
  catch (error) {
    statusError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    isRefreshing.value = false
  }
}

async function refreshSidecarStatus() {
  if (isRefreshingSidecar.value)
    return

  isRefreshingSidecar.value = true
  sidecarError.value = ''
  try {
    sidecarStatus.value = await invokeGetPlastMemSidecarStatus()
  }
  catch (error) {
    sidecarError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    isRefreshingSidecar.value = false
  }
}

async function refreshHealth() {
  if (isCheckingHealth.value)
    return

  isCheckingHealth.value = true
  healthError.value = ''
  try {
    const result = await invokePlastMemHealth({})
    health.value = result
    if (result.error)
      healthError.value = result.error
    else if (result.databaseError)
      healthError.value = result.databaseError
  }
  catch (error) {
    healthError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    isCheckingHealth.value = false
  }
}

async function startSidecar() {
  if (isStartingSidecar.value)
    return

  isStartingSidecar.value = true
  sidecarError.value = ''
  try {
    const saved = await saveConfig({
      refreshAfterSave: false,
      showSavedMessage: false,
      syncDraft: 'always',
    })
    if (!saved)
      return

    sidecarStatus.value = await invokeStartPlastMemSidecar()
    await refreshStatus()
    await refreshHealth()
  }
  catch (error) {
    sidecarError.value = errorMessageFrom(error) ?? 'Unknown error'
    await refreshSidecarStatus()
  }
  finally {
    isStartingSidecar.value = false
  }
}

async function stopSidecar() {
  if (isStoppingSidecar.value)
    return

  isStoppingSidecar.value = true
  sidecarError.value = ''
  try {
    sidecarStatus.value = await invokeStopPlastMemSidecar()
    await refreshStatus()
    await refreshHealth()
  }
  catch (error) {
    sidecarError.value = errorMessageFrom(error) ?? 'Unknown error'
    await refreshSidecarStatus()
  }
  finally {
    isStoppingSidecar.value = false
  }
}

async function restartSidecar() {
  if (isRestartingSidecar.value)
    return

  isRestartingSidecar.value = true
  sidecarError.value = ''
  try {
    const saved = await saveConfig({
      refreshAfterSave: false,
      showSavedMessage: false,
      syncDraft: 'always',
    })
    if (!saved)
      return

    sidecarStatus.value = await invokeRestartPlastMemSidecar()
    await refreshStatus()
    await refreshHealth()
  }
  catch (error) {
    sidecarError.value = errorMessageFrom(error) ?? 'Unknown error'
    await refreshSidecarStatus()
  }
  finally {
    isRestartingSidecar.value = false
  }
}

async function refreshRecentMemories() {
  if (isLoadingRecentMemories.value)
    return

  isLoadingRecentMemories.value = true
  recentMemoriesError.value = ''
  try {
    const result = await invokeRecentMemoryRaw({ limit: 20 })
    if (result.error) {
      recentMemoriesError.value = result.error
      recentMemories.value = []
    }
    else {
      recentMemories.value = result.memories
    }
  }
  catch (error) {
    recentMemoriesError.value = errorMessageFrom(error) ?? 'Unknown error'
    recentMemories.value = []
  }
  finally {
    isLoadingRecentMemories.value = false
  }
}

async function refreshSemanticMemories() {
  if (isLoadingSemanticMemories.value)
    return

  isLoadingSemanticMemories.value = true
  semanticMemoriesError.value = ''
  try {
    const result = await invokeSemanticMemoryRaw({
      category: configDraft.value.category.trim() || undefined,
      includeInvalid: includeInvalidSemanticMemories.value,
      limit: 50,
    })
    if (result.error) {
      semanticMemoriesError.value = result.error
      semanticMemories.value = []
    }
    else {
      semanticMemories.value = result.memories
    }
  }
  catch (error) {
    semanticMemoriesError.value = errorMessageFrom(error) ?? 'Unknown error'
    semanticMemories.value = []
  }
  finally {
    isLoadingSemanticMemories.value = false
  }
}

async function importRecentChatMessages() {
  if (isManualImporting.value)
    return

  isManualImporting.value = true
  manualImportError.value = ''
  manualImportMessage.value = ''
  try {
    const messages = importableChatMessages.value
    if (messages.length === 0) {
      manualImportError.value = tn('manual-import.empty')
      return
    }

    const result = await invokeIngestChatMessages({ messages })
    if (result.error) {
      manualImportError.value = result.error
      return
    }

    manualImportMessage.value = result.accepted
      ? tn('manual-import.accepted', { count: messages.length })
      : tn('manual-import.rejected')
    await refreshStatus()
    await refreshHealth()
  }
  catch (error) {
    manualImportError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    isManualImporting.value = false
  }
}

async function previewMemoryRecall() {
  if (isPreviewingRecall.value)
    return

  isPreviewingRecall.value = true
  previewError.value = ''
  previewResult.value = undefined
  try {
    const query = previewQuery.value.trim()
    if (!query) {
      previewError.value = tn('recall-preview.empty-query')
      return
    }

    const result = await invokeRetrieveMemoryRaw({
      category: configDraft.value.category.trim() || undefined,
      detail: 'low',
      episodicLimit: configDraft.value.episodicLimit,
      query,
      semanticLimit: configDraft.value.semanticLimit,
    })
    previewResult.value = result
    if (result.error)
      previewError.value = result.error
  }
  catch (error) {
    previewError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    isPreviewingRecall.value = false
  }
}

async function showSemanticMemorySources(memory: ElectronPlastMemSemanticMemory) {
  selectedSourceMemoryIds.value = memory.source_episodic_ids
  activeDetailPanel.value = 'semantic'
  if (recentMemories.value.length < 100)
    await refreshRecentMemories()
}

async function setSemanticMemoryInvalid(memory: ElectronPlastMemSemanticMemory, invalid: boolean) {
  if (mutatingSemanticMemoryId.value)
    return

  mutatingSemanticMemoryId.value = memory.id
  semanticMemoriesError.value = ''
  try {
    const result = await invokeSetSemanticMemoryInvalid({
      invalid,
      memoryId: memory.id,
    })
    if (result.error) {
      semanticMemoriesError.value = result.error
      return
    }

    if (!includeInvalidSemanticMemories.value && invalid) {
      semanticMemories.value = semanticMemories.value.filter(item => item.id !== memory.id)
    }
    else if (result.memory) {
      const updatedMemory = result.memory
      semanticMemories.value = semanticMemories.value.map(item =>
        item.id === updatedMemory.id ? updatedMemory : item,
      )
    }

    await refreshHealth()
  }
  catch (error) {
    semanticMemoriesError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    mutatingSemanticMemoryId.value = ''
  }
}

function formatMemoryTime(value: string | undefined) {
  if (!value)
    return '-'
  return new Date(value).toLocaleString()
}

function formatCount(value: number | undefined) {
  return value == null ? '-' : value.toLocaleString()
}

function classificationLabel(classification: string | null | undefined) {
  if (classification === 'informative')
    return tn('recent-memories.classification.informative')
  if (classification === 'low_info')
    return tn('recent-memories.classification.low-info')
  return '-'
}

function semanticMemoryStatusLabel(memory: ElectronPlastMemSemanticMemory) {
  return memory.invalid_at
    ? tn('semantic-memories.status.invalid')
    : tn('semantic-memories.status.active')
}

function semanticMemoryStatusBadgeClass(memory: ElectronPlastMemSemanticMemory) {
  if (memory.invalid_at)
    return 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300'

  return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
}

watch(includeInvalidSemanticMemories, () => {
  void refreshSemanticMemories()
})

watch(activeDetailPanel, (panel) => {
  if (panel === 'health')
    void refreshHealth()
  else if (panel === 'recent')
    void refreshRecentMemories()
  else if (panel === 'semantic')
    void refreshSemanticMemories()
  else if (panel === 'runtime')
    void refreshStatus()
})

const debouncedAutoSaveConfig = useDebounceFn(() => {
  void saveConfig({
    refreshAfterSave: false,
    showSavedMessage: true,
    syncDraft: 'ifStable',
  })
}, 600, { maxWait: 1500 })

watch(() => configDraft.value, () => {
  if (suppressConfigAutoSave)
    return

  configDraftRevision += 1
  debouncedAutoSaveConfig()
}, { deep: true })

function contextSourceLabel(source: string) {
  return tn(`chat-diagnostics.contexts.source.${source}`)
}

onMounted(() => {
  void refreshConfig()
  void refreshStatus()
  void refreshSidecarStatus()
  void refreshHealth()
  void refreshSemanticMemories()
  refreshTimer = setInterval(() => {
    void refreshStatus()
    void refreshSidecarStatus()
  }, 5000)
})

onBeforeUnmount(() => {
  if (refreshTimer)
    clearInterval(refreshTimer)
})
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-4']">
    <section
      :class="[
        'flex',
        'flex-col',
        'gap-5',
        'rounded-xl',
        'bg-neutral-50',
        'p-4',
        'dark:bg-[rgba(0,0,0,0.3)]',
      ]"
    >
      <div :class="['flex', 'flex-col', 'gap-2']">
        <div :class="['flex', 'items-center', 'gap-3']">
          <div :class="['i-solar:book-bookmark-bold-duotone', 'text-2xl', 'text-primary-500', 'dark:text-primary-300']" />
          <h2 :class="['text-lg', 'font-semibold', 'text-neutral-600', 'md:text-2xl', 'dark:text-neutral-300']">
            {{ t('settings.pages.modules.memory-long-term.sections.plast-mem-bridge.title') }}
          </h2>
        </div>
        <p :class="['max-w-3xl', 'text-sm', 'text-neutral-500', 'leading-6', 'dark:text-neutral-400']">
          {{ t('settings.pages.modules.memory-long-term.sections.plast-mem-bridge.description') }}
        </p>
      </div>

      <section
        :class="[
          'flex',
          'flex-col',
          'gap-3',
          'rounded-lg',
          'border',
          'border-neutral-200/70',
          'bg-white/70',
          'p-3',
          'dark:border-neutral-800/70',
          'dark:bg-neutral-900/30',
        ]"
      >
        <div :class="['flex', 'items-center', 'gap-2']">
          <div :class="['i-solar:layers-bold-duotone', 'text-xl', 'text-primary-500', 'dark:text-primary-300']" />
          <h3 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
            {{ tn('panels.title') }}
          </h3>
        </div>
        <div
          role="tablist"
          :aria-label="tn('panels.title')"
          :class="[
            'flex',
            'flex-wrap',
            'gap-1.5',
          ]"
        >
          <button
            v-for="panel in detailPanelOptions"
            :key="panel.value"
            type="button"
            role="tab"
            :aria-selected="activeDetailPanel === panel.value"
            :class="[
              'min-h-8',
              'max-w-full',
              'inline-flex',
              'items-center',
              'justify-center',
              'gap-1.5',
              'rounded-md',
              'border',
              'px-2',
              'py-1.5',
              'text-[11px]',
              'font-medium',
              'transition-[background-color,border-color,color,box-shadow]',
              'duration-200',
              activeDetailPanel === panel.value
                ? [
                  'border-primary-400/60',
                  'bg-primary-300/30',
                  'text-primary-950',
                  'shadow-sm',
                  'dark:border-primary-400/40',
                  'dark:bg-primary-400/20',
                  'dark:text-primary-50',
                ]
                : [
                  'border-neutral-200/70',
                  'bg-neutral-100/70',
                  'text-neutral-600',
                  'hover:border-primary-300/50',
                  'hover:bg-primary-300/15',
                  'dark:border-neutral-800/70',
                  'dark:bg-neutral-950/30',
                  'dark:text-neutral-300',
                  'dark:hover:border-primary-400/40',
                  'dark:hover:bg-primary-400/15',
                ],
            ]"
            @click="activeDetailPanel = panel.value"
          >
            <span :class="[panel.icon, 'size-3.5', 'shrink-0']" />
            <span :class="['truncate']">
              {{ panel.label }}
            </span>
          </button>
        </div>
      </section>

      <section
        v-if="activeDetailPanel === 'config'"
        :class="[
          'flex',
          'flex-col',
          'gap-4',
          'rounded-lg',
          'border',
          'border-neutral-200/70',
          'bg-white/70',
          'p-3',
          'dark:border-neutral-800/70',
          'dark:bg-neutral-900/30',
        ]"
      >
        <div :class="['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-3']">
          <div :class="['flex', 'items-center', 'gap-2']">
            <div :class="['i-solar:tuning-square-bold-duotone', 'text-xl', 'text-primary-500', 'dark:text-primary-300']" />
            <h3 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
              {{ tn('config.title') }}
            </h3>
          </div>
          <span
            :class="[
              'inline-flex',
              'items-center',
              'gap-1.5',
              'rounded-full',
              'bg-neutral-500/15',
              'px-2.5',
              'py-1',
              'text-xs',
              'font-medium',
              'text-neutral-600',
              'dark:text-neutral-300',
            ]"
          >
            <span :class="['size-1.5', 'rounded-full', 'bg-current']" />
            {{ status?.configuredByUser ? tn('config.source.ui') : tn('config.source.env') }}
          </span>
        </div>

        <div :class="['grid', 'grid-cols-1', 'gap-3', 'lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]']">
          <Callout theme="primary" :label="tn('config.notice.title')">
            {{ tn('config.notice.description') }}
          </Callout>

          <div
            :class="[
              'grid',
              'grid-cols-2',
              'gap-2',
              'rounded-md',
              'bg-neutral-100/70',
              'p-3',
              'dark:bg-neutral-950/30',
            ]"
          >
            <div :class="['flex', 'items-center', 'gap-2']">
              <div :class="['i-solar:power-bold-duotone', 'text-lg', configDraft.enabled ? 'text-emerald-500' : 'text-neutral-400']" />
              <div :class="['min-w-0', 'flex', 'flex-col']">
                <span :class="['text-[10px]', 'font-medium', 'uppercase', 'text-neutral-400', 'dark:text-neutral-500']">
                  {{ tn('config.quick.enabled') }}
                </span>
                <span :class="['truncate', 'text-xs', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                  {{ configDraft.enabled ? tn('runtime.status.online') : tn('runtime.status.disabled') }}
                </span>
              </div>
            </div>
            <div :class="['flex', 'items-center', 'gap-2']">
              <div :class="['i-solar:restart-bold-duotone', 'text-lg', configDraft.autoStart ? 'text-sky-500' : 'text-neutral-400']" />
              <div :class="['min-w-0', 'flex', 'flex-col']">
                <span :class="['text-[10px]', 'font-medium', 'uppercase', 'text-neutral-400', 'dark:text-neutral-500']">
                  {{ tn('config.quick.autostart') }}
                </span>
                <span :class="['truncate', 'text-xs', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                  {{ configDraft.autoStart ? tn('health.status.ok') : tn('runtime.status.disabled') }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div :class="['grid', 'grid-cols-1', 'gap-4', 'xl:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]']">
          <div :class="['flex', 'flex-col', 'gap-4']">
            <section :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-950/30']">
              <div :class="['flex', 'items-start', 'gap-2']">
                <div :class="['i-solar:plug-circle-bold-duotone', 'mt-0.5', 'text-lg', 'text-primary-500', 'dark:text-primary-300']" />
                <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
                  <h4 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                    {{ tn('config.groups.connection.title') }}
                  </h4>
                  <p :class="['text-xs', 'text-neutral-500', 'leading-5', 'dark:text-neutral-400']">
                    {{ tn('config.groups.connection.description') }}
                  </p>
                </div>
              </div>

              <div :class="['grid', 'grid-cols-1', 'gap-4', 'lg:grid-cols-2']">
                <FieldCheckbox
                  v-model="configDraft.enabled"
                  :label="tn('config.fields.enabled.label')"
                  :description="tn('config.fields.enabled.description')"
                />
                <FieldCheckbox
                  v-model="configDraft.autoStart"
                  :label="tn('config.fields.auto-start.label')"
                  :description="tn('config.fields.auto-start.description')"
                />
                <FieldInput
                  v-model="configDraft.baseUrl"
                  :label="tn('config.fields.base-url.label')"
                  :description="tn('config.fields.base-url.description')"
                  placeholder="http://127.0.0.1:3000"
                />
                <FieldInput
                  v-model="configDraft.databaseUrl"
                  :label="tn('config.fields.database-url.label')"
                  :description="tn('config.fields.database-url.description')"
                  placeholder="postgres://postgres:postgres@localhost:5433/nocturne"
                />
              </div>
            </section>

            <section :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-950/30']">
              <div :class="['flex', 'items-start', 'gap-2']">
                <div :class="['i-solar:cpu-bold-duotone', 'mt-0.5', 'text-lg', 'text-primary-500', 'dark:text-primary-300']" />
                <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
                  <h4 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                    {{ tn('config.groups.models.title') }}
                  </h4>
                  <p :class="['text-xs', 'text-neutral-500', 'leading-5', 'dark:text-neutral-400']">
                    {{ tn('config.groups.models.description') }}
                  </p>
                </div>
              </div>

              <div :class="['grid', 'grid-cols-1', 'gap-4', 'lg:grid-cols-2']">
                <FieldInput
                  v-model="configDraft.openaiBaseUrl"
                  :label="tn('config.fields.openai-base-url.label')"
                  :description="tn('config.fields.openai-base-url.description')"
                  placeholder="https://api.siliconflow.cn/v1/"
                />

                <div :class="['max-w-full']">
                  <label :class="['flex', 'flex-col', 'gap-4']">
                    <div>
                      <div :class="['flex', 'items-center', 'gap-1', 'text-sm', 'font-medium']">
                        {{ tn('config.fields.openai-api-key.label') }}
                      </div>
                      <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']" text-wrap>
                        {{ tn('config.fields.openai-api-key.description') }}
                      </div>
                    </div>
                    <div :class="['flex', 'items-center', 'gap-2']">
                      <Input
                        v-model="configDraft.openaiApiKey"
                        :type="apiKeyInputType"
                        placeholder="sk-..."
                      />
                      <Button
                        type="button"
                        variant="secondary-muted"
                        size="sm"
                        shape="square"
                        :icon="apiKeyVisible ? 'i-solar:eye-closed-bold-duotone' : 'i-solar:eye-bold-duotone'"
                        :aria-label="apiKeyVisible ? tn('config.hide-api-key') : tn('config.show-api-key')"
                        :title="apiKeyVisible ? tn('config.hide-api-key') : tn('config.show-api-key')"
                        @click="apiKeyVisible = !apiKeyVisible"
                      />
                    </div>
                  </label>
                </div>

                <FieldInput
                  v-model="configDraft.openaiChatModel"
                  :label="tn('config.fields.openai-chat-model.label')"
                  :description="tn('config.fields.openai-chat-model.description')"
                  placeholder="Qwen/Qwen3.5-9B"
                />
                <FieldInput
                  v-model="configDraft.openaiEmbeddingModel"
                  :label="tn('config.fields.openai-embedding-model.label')"
                  :description="tn('config.fields.openai-embedding-model.description')"
                  placeholder="Qwen/Qwen3-Embedding-0.6B"
                />
              </div>
            </section>
          </div>

          <div :class="['flex', 'flex-col', 'gap-4']">
            <section :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-950/30']">
              <div :class="['flex', 'items-start', 'gap-2']">
                <div :class="['i-solar:chat-round-like-bold-duotone', 'mt-0.5', 'text-lg', 'text-primary-500', 'dark:text-primary-300']" />
                <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
                  <h4 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                    {{ tn('config.groups.behavior.title') }}
                  </h4>
                  <p :class="['text-xs', 'text-neutral-500', 'leading-5', 'dark:text-neutral-400']">
                    {{ tn('config.groups.behavior.description') }}
                  </p>
                </div>
              </div>

              <div :class="['grid', 'grid-cols-1', 'gap-3']">
                <FieldCheckbox
                  v-model="configDraft.enableContextPreRetrieve"
                  :label="tn('config.fields.enable-context-pre-retrieve.label')"
                  :description="tn('config.fields.enable-context-pre-retrieve.description')"
                />
                <FieldCheckbox
                  v-model="configDraft.enableChatRetrieve"
                  :label="tn('config.fields.enable-chat-retrieve.label')"
                  :description="tn('config.fields.enable-chat-retrieve.description')"
                />
                <FieldCheckbox
                  v-model="configDraft.enableRecentMemory"
                  :label="tn('config.fields.enable-recent-memory.label')"
                  :description="tn('config.fields.enable-recent-memory.description')"
                />
                <FieldCheckbox
                  v-model="configDraft.enableChatIngest"
                  :label="tn('config.fields.enable-chat-ingest.label')"
                  :description="tn('config.fields.enable-chat-ingest.description')"
                />
              </div>
            </section>

            <section :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-950/30']">
              <div :class="['flex', 'items-start', 'gap-2']">
                <div :class="['i-solar:settings-minimalistic-bold-duotone', 'mt-0.5', 'text-lg', 'text-primary-500', 'dark:text-primary-300']" />
                <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
                  <h4 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                    {{ tn('config.groups.limits.title') }}
                  </h4>
                  <p :class="['text-xs', 'text-neutral-500', 'leading-5', 'dark:text-neutral-400']">
                    {{ tn('config.groups.limits.description') }}
                  </p>
                </div>
              </div>

              <div :class="['grid', 'grid-cols-1', 'gap-4', 'sm:grid-cols-2']">
                <FieldInput
                  v-model="configDraft.category"
                  :label="tn('config.fields.category.label')"
                  :description="tn('config.fields.category.description')"
                  placeholder=""
                />
                <FieldInput
                  v-model="configDraft.episodicLimit"
                  type="number"
                  :label="tn('config.fields.episodic-limit.label')"
                  :description="tn('config.fields.episodic-limit.description')"
                  placeholder="4"
                />
                <FieldInput
                  v-model="configDraft.semanticLimit"
                  type="number"
                  :label="tn('config.fields.semantic-limit.label')"
                  :description="tn('config.fields.semantic-limit.description')"
                  placeholder="8"
                />
                <FieldInput
                  v-model="configDraft.maxContextCharacters"
                  type="number"
                  :label="tn('config.fields.max-context-characters.label')"
                  :description="tn('config.fields.max-context-characters.description')"
                  placeholder="6000"
                />
              </div>
            </section>

            <section :class="['rounded-md', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-950/30']">
              <Collapsible v-model="advancedConfigVisible">
                <template #trigger="slotProps">
                  <button
                    type="button"
                    :class="[
                      'w-full',
                      'flex',
                      'items-center',
                      'justify-between',
                      'gap-3',
                      'text-left',
                      'outline-none',
                      'transition-all',
                      'duration-250',
                      'ease-in-out',
                    ]"
                    @click="slotProps.setVisible(!slotProps.visible)"
                  >
                    <div :class="['min-w-0', 'flex', 'items-start', 'gap-2']">
                      <div :class="['i-solar:tuning-square-bold-duotone', 'mt-0.5', 'text-lg', 'text-primary-500', 'dark:text-primary-300']" />
                      <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
                        <h4 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                          {{ t('settings.pages.providers.common.section.advanced.title') }}
                        </h4>
                        <p :class="['text-xs', 'text-neutral-500', 'leading-5', 'dark:text-neutral-400']">
                          {{ advancedConfigSummary }}
                        </p>
                      </div>
                    </div>
                    <div
                      :class="[
                        'shrink-0',
                        'text-neutral-400',
                        'transition-transform',
                        'duration-250',
                        'dark:text-neutral-500',
                        'i-solar:alt-arrow-down-linear',
                        slotProps.visible ? 'rotate-180' : 'rotate-0',
                      ]"
                    />
                  </button>
                </template>

                <div :class="['mt-3', 'grid', 'grid-cols-1', 'gap-4', 'sm:grid-cols-2']">
                  <FieldInput
                    v-model="configDraft.conversationId"
                    :label="tn('config.fields.conversation-id.label')"
                    :description="tn('config.fields.conversation-id.description')"
                    placeholder="c2cb0334-d2ed-4989-8659-7ead6b5f4d3c"
                  />
                  <FieldInput
                    v-model="configDraft.workspaceKey"
                    :label="tn('config.fields.workspace-key.label')"
                    :description="tn('config.fields.workspace-key.description')"
                    placeholder="airi-main"
                  />
                  <FieldInput
                    v-model="configDraft.requestTimeoutMsec"
                    type="number"
                    :label="tn('config.fields.request-timeout-msec.label')"
                    :description="tn('config.fields.request-timeout-msec.description')"
                    placeholder="10000"
                  />
                  <FieldInput
                    v-model="configDraft.openaiChatMaxTokens"
                    type="number"
                    :label="tn('config.fields.openai-chat-max-tokens.label')"
                    :description="tn('config.fields.openai-chat-max-tokens.description')"
                    placeholder="2048"
                  />
                  <FieldInput
                    v-model="configDraft.openaiRequestTimeoutSeconds"
                    type="number"
                    :label="tn('config.fields.openai-request-timeout.label')"
                    :description="tn('config.fields.openai-request-timeout.description')"
                    placeholder="120"
                  />
                </div>
              </Collapsible>
            </section>
          </div>
        </div>

        <Callout v-if="configError" theme="orange" :label="tn('config.error')">
          {{ configError }}
        </Callout>
        <Callout v-else-if="configSavedMessage" theme="lime" :label="configSavedMessage">
          {{ tn('config.saved-description') }}
        </Callout>

        <div :class="['flex', 'flex-wrap', 'items-center', 'justify-end', 'gap-2']">
          <Button
            variant="secondary" size="sm" :loading="isLoadingConfig"
            icon="i-solar:refresh-bold-duotone" :label="tn('config.reload')"
            @click="refreshConfig"
          />
          <Button
            variant="secondary" size="sm" :loading="isSavingConfig"
            icon="i-solar:diskette-bold-duotone" :label="tn('config.save')"
            @click="saveConfig({ refreshAfterSave: true, showSavedMessage: true, syncDraft: 'always' })"
          />
          <Button
            size="sm" :loading="isTestingConnection || isSavingConfig || isRefreshing"
            icon="i-solar:plug-circle-bold-duotone" :label="tn('config.save-and-check')"
            @click="testConnection(true)"
          />
        </div>
      </section>

      <section
        v-else-if="activeDetailPanel === 'runtime'"
        :class="[
          'flex',
          'flex-col',
          'gap-4',
          'rounded-lg',
          'border',
          'border-neutral-200/70',
          'bg-white/70',
          'p-3',
          'dark:border-neutral-800/70',
          'dark:bg-neutral-900/30',
        ]"
      >
        <div :class="['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-3']">
          <div :class="['flex', 'items-center', 'gap-2']">
            <div :class="['i-solar:pulse-2-bold-duotone', 'text-xl', 'text-primary-500', 'dark:text-primary-300']" />
            <h3 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
              {{ tn('runtime.title') }}
            </h3>
          </div>
          <span
            :class="[
              'inline-flex',
              'items-center',
              'gap-1.5',
              'rounded-full',
              'px-2.5',
              'py-1',
              'text-xs',
              'font-medium',
              statusBadgeClass,
            ]"
          >
            <span :class="['size-1.5', 'rounded-full', 'bg-current']" />
            {{ tn(`runtime.status.${statusKind}`) }}
          </span>
        </div>

        <div :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-950/30']">
          <div :class="['flex', 'flex-wrap', 'items-start', 'justify-between', 'gap-3']">
            <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
              <div :class="['flex', 'items-center', 'gap-2']">
                <div :class="['i-solar:server-square-bold-duotone', 'text-lg', 'text-neutral-500']" />
                <span :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">{{ tn('runtime.sidecar.title') }}</span>
              </div>
              <p :class="['text-xs', 'text-neutral-500', 'leading-5', 'dark:text-neutral-400']">
                {{ tn('runtime.sidecar.description') }}
              </p>
            </div>
            <span :class="['rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium', sidecarStatusBadgeClass]">
              {{ sidecarStatusLabel }}
            </span>
          </div>

          <div :class="['grid', 'grid-cols-1', 'gap-2', 'md:grid-cols-3']">
            <div :class="['min-w-0', 'flex', 'flex-col', 'gap-0.5']">
              <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('runtime.sidecar.pid') }}</span>
              <span :class="['font-mono', 'text-xs', 'text-neutral-700', 'dark:text-neutral-200']">{{ sidecarStatus?.pid ?? '-' }}</span>
            </div>
            <div :class="['min-w-0', 'flex', 'flex-col', 'gap-0.5']">
              <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('runtime.sidecar.command') }}</span>
              <span :class="['truncate', 'font-mono', 'text-xs', 'text-neutral-700', 'dark:text-neutral-200']">{{ sidecarStatus?.command ?? '-' }}</span>
            </div>
            <div :class="['min-w-0', 'flex', 'flex-col', 'gap-0.5']">
              <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('runtime.sidecar.cwd') }}</span>
              <span :class="['truncate', 'font-mono', 'text-xs', 'text-neutral-700', 'dark:text-neutral-200']">{{ sidecarStatus?.cwd ?? '-' }}</span>
            </div>
          </div>

          <Callout v-if="sidecarError || sidecarStatus?.lastError" theme="orange" :label="tn('runtime.sidecar.error')">
            {{ sidecarError || sidecarStatus?.lastError }}
          </Callout>

          <div :class="['flex', 'flex-wrap', 'items-center', 'justify-end', 'gap-2']">
            <Button
              variant="secondary" size="sm" :loading="isRefreshingSidecar"
              icon="i-solar:refresh-bold-duotone" :label="tn('runtime.sidecar.refresh')"
              @click="refreshSidecarStatus"
            />
            <Button
              variant="secondary" size="sm" :loading="isStartingSidecar || isSavingConfig"
              :disabled="!sidecarCanStart"
              icon="i-solar:play-circle-bold-duotone" :label="tn('runtime.sidecar.start')"
              @click="startSidecar"
            />
            <Button
              variant="secondary" size="sm" :loading="isStoppingSidecar"
              :disabled="!sidecarCanStop"
              icon="i-solar:stop-circle-bold-duotone" :label="tn('runtime.sidecar.stop')"
              @click="stopSidecar"
            />
            <Button
              size="sm" :loading="isRestartingSidecar || isSavingConfig"
              :disabled="!sidecarCanRestart"
              icon="i-solar:restart-circle-bold-duotone" :label="tn('runtime.sidecar.restart')"
              @click="restartSidecar"
            />
          </div>
        </div>

        <div :class="['grid', 'grid-cols-1', 'gap-2', 'md:grid-cols-2']">
          <div :class="['min-w-0', 'flex', 'items-center', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'px-3', 'py-2', 'dark:bg-neutral-950/30']">
            <div :class="['i-solar:plug-circle-bold-duotone', 'text-lg', 'text-neutral-500']" />
            <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
              <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('runtime.mcp-server') }}</span>
              <span :class="['w-fit', 'rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium', mcpServerBadgeClass]">{{ mcpServerLabel }}</span>
            </div>
          </div>

          <div :class="['min-w-0', 'flex', 'items-center', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'px-3', 'py-2', 'dark:bg-neutral-950/30']">
            <div :class="['i-solar:folder-with-files-bold-duotone', 'text-lg', 'text-neutral-500']" />
            <div :class="['min-w-0', 'flex', 'flex-col', 'gap-0.5']">
              <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('runtime.workspace') }}</span>
              <span :class="['truncate', 'font-mono', 'text-xs', 'text-neutral-700', 'dark:text-neutral-200']">{{ status?.workspaceKey ?? '-' }}</span>
            </div>
          </div>
        </div>

        <Callout v-if="statusError" theme="orange" :label="tn('runtime.status-error')">
          {{ statusError }}
        </Callout>
        <Callout v-else-if="status && !status.mcpServer" theme="orange" :label="tn('runtime.mcp-missing-title')">
          {{ tn('runtime.mcp-missing') }}
        </Callout>
        <Callout v-else-if="status?.error" theme="orange" :label="tn('runtime.service-error')">
          {{ status.error }}
        </Callout>
        <Callout v-else-if="status?.enabled && !status.conversationIdConfigured" theme="orange" :label="tn('runtime.conversation-missing-title')">
          {{ tn('runtime.conversation-missing') }}
        </Callout>

        <section :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-950/30']">
          <div :class="['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-3']">
            <div :class="['flex', 'items-start', 'gap-2']">
              <div :class="['i-solar:shield-check-bold-duotone', 'mt-0.5', 'text-lg', 'text-primary-500', 'dark:text-primary-300']" />
              <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
                <h4 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                  {{ tn('config.test.title') }}
                </h4>
                <p :class="['text-xs', 'text-neutral-500', 'leading-5', 'dark:text-neutral-400']">
                  {{ tn('config.test.description') }}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              :loading="isTestingConnection"
              icon="i-solar:play-circle-bold-duotone"
              :label="tn('config.test.action')"
              @click="testConnection(false)"
            />
          </div>

          <div :class="['grid', 'grid-cols-1', 'gap-2', 'md:grid-cols-2', 'xl:grid-cols-5']">
            <div
              v-for="check in connectionChecks"
              :key="check.label"
              :class="[
                'min-w-0',
                'flex',
                'flex-col',
                'gap-2',
                'rounded-md',
                'bg-white/70',
                'p-2.5',
                'dark:bg-neutral-900/70',
              ]"
            >
              <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                <div :class="['min-w-0', 'flex', 'items-center', 'gap-2']">
                  <div :class="[check.icon, 'shrink-0', 'text-base', 'text-neutral-500']" />
                  <span :class="['truncate', 'text-xs', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                    {{ check.label }}
                  </span>
                </div>
                <span :class="['shrink-0', 'rounded-full', 'px-2', 'py-0.5', 'text-[10px]', 'font-medium', connectionCheckBadgeClass(check.kind)]">
                  {{ connectionCheckStatusLabel(check.kind) }}
                </span>
              </div>
              <p :class="['line-clamp-2', 'break-words', 'text-[11px]', 'text-neutral-500', 'leading-4', 'dark:text-neutral-400']">
                {{ check.detail }}
              </p>
            </div>
          </div>
        </section>

        <div :class="['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-2']">
          <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            {{ tn('runtime.checked-at', { time: checkedAt }) }}
          </span>
          <Button
            variant="secondary" size="sm" :loading="isRefreshing"
            icon="i-solar:refresh-bold-duotone" :label="tn('runtime.refresh')"
            @click="refreshStatus"
          />
        </div>
      </section>

      <section
        v-else-if="activeDetailPanel === 'health'"
        :class="[
          'flex',
          'flex-col',
          'gap-4',
          'rounded-lg',
          'border',
          'border-neutral-200/70',
          'bg-white/70',
          'p-3',
          'dark:border-neutral-800/70',
          'dark:bg-neutral-900/30',
        ]"
      >
        <div :class="['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-3']">
          <div :class="['flex', 'items-center', 'gap-2']">
            <div :class="['i-solar:shield-check-bold-duotone', 'text-xl', 'text-primary-500', 'dark:text-primary-300']" />
            <h3 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
              {{ tn('health.title') }}
            </h3>
          </div>
          <Button
            variant="secondary" size="sm" :loading="isCheckingHealth"
            icon="i-solar:refresh-bold-duotone" :label="tn('health.refresh')"
            @click="refreshHealth"
          />
        </div>

        <div :class="['grid', 'grid-cols-1', 'gap-2', 'md:grid-cols-3']">
          <div :class="['min-w-0', 'flex', 'items-center', 'justify-between', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'px-3', 'py-2', 'dark:bg-neutral-950/30']">
            <div :class="['flex', 'items-center', 'gap-2']">
              <div :class="['i-solar:server-square-bold-duotone', 'text-lg', 'text-neutral-500']" />
              <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('health.service') }}</span>
            </div>
            <span :class="['rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium', healthServiceBadgeClass]">
              {{ healthServiceOk ? tn('health.status.ok') : health ? tn('health.status.error') : tn('health.status.unknown') }}
            </span>
          </div>

          <div :class="['min-w-0', 'flex', 'items-center', 'justify-between', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'px-3', 'py-2', 'dark:bg-neutral-950/30']">
            <div :class="['flex', 'items-center', 'gap-2']">
              <div :class="['i-solar:database-bold-duotone', 'text-lg', 'text-neutral-500']" />
              <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('health.database') }}</span>
            </div>
            <span :class="['rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium', healthDatabaseBadgeClass]">
              {{ health?.databaseOk ? tn('health.status.ok') : health ? tn('health.status.error') : tn('health.status.unknown') }}
            </span>
          </div>

          <div :class="['min-w-0', 'flex', 'items-center', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'px-3', 'py-2', 'dark:bg-neutral-950/30']">
            <div :class="['i-solar:clock-circle-bold-duotone', 'text-lg', 'text-neutral-500']" />
            <div :class="['min-w-0', 'flex', 'flex-col', 'gap-0.5']">
              <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('health.server-time') }}</span>
              <span :class="['truncate', 'font-mono', 'text-xs', 'text-neutral-700', 'dark:text-neutral-200']">{{ healthCheckedAt }}</span>
            </div>
          </div>
        </div>

        <div :class="['grid', 'grid-cols-2', 'gap-2', 'lg:grid-cols-6']">
          <div
            v-for="item in [
              { key: 'conversation-messages', value: healthCounts?.conversation_messages },
              { key: 'episode-spans', value: healthCounts?.episode_spans },
              { key: 'episodic-memories', value: healthCounts?.episodic_memories },
              { key: 'semantic-memories', value: healthCounts?.semantic_memories },
              { key: 'active-semantic-memories', value: healthCounts?.active_semantic_memories },
              { key: 'pending-reviews', value: healthCounts?.pending_reviews },
            ]"
            :key="item.key"
            :class="['min-w-0', 'flex', 'flex-col', 'gap-1', 'rounded-md', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-950/30']"
          >
            <span :class="['text-[10px]', 'font-medium', 'uppercase', 'text-neutral-400', 'dark:text-neutral-500']">{{ tn(`health.counts.${item.key}`) }}</span>
            <span :class="['font-mono', 'text-lg', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">{{ formatCount(item.value) }}</span>
          </div>
        </div>

        <Callout v-if="healthError" theme="orange" :label="tn('health.error')">
          {{ healthError }}
        </Callout>

        <section :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-950/30']">
          <div :class="['flex', 'items-start', 'justify-between', 'gap-3']">
            <div :class="['flex', 'items-start', 'gap-2']">
              <div :class="['i-solar:checklist-minimalistic-bold-duotone', 'mt-0.5', 'text-lg', 'text-neutral-500']" />
              <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
                <h4 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                  {{ tn('review-queue.title') }}
                </h4>
                <p :class="['text-xs', 'text-neutral-500', 'leading-5', 'dark:text-neutral-400']">
                  {{ tn('review-queue.description') }}
                </p>
              </div>
            </div>
            <span :class="['rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium', pendingReviewCount > 0 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300']">
              {{ tn('review-queue.pending', { count: pendingReviewCount }) }}
            </span>
          </div>
          <Callout theme="primary" :label="tn('review-queue.status-title')">
            {{ tn('review-queue.status-description') }}
          </Callout>
        </section>
      </section>

      <section
        v-else-if="activeDetailPanel === 'diagnostics'"
        :class="[
          'flex',
          'flex-col',
          'gap-4',
          'rounded-lg',
          'border',
          'border-neutral-200/70',
          'bg-white/70',
          'p-3',
          'dark:border-neutral-800/70',
          'dark:bg-neutral-900/30',
        ]"
      >
        <div :class="['flex', 'items-center', 'gap-2']">
          <div :class="['i-solar:chat-round-dots-bold-duotone', 'text-xl', 'text-primary-500', 'dark:text-primary-300']" />
          <h3 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
            {{ tn('chat-diagnostics.title') }}
          </h3>
        </div>

        <div :class="['grid', 'grid-cols-1', 'gap-3', 'md:grid-cols-2']">
          <div :class="['min-w-0', 'flex', 'flex-col', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-950/30']">
            <div :class="['flex', 'items-center', 'justify-between', 'gap-3']">
              <div :class="['flex', 'items-center', 'gap-2']">
                <div :class="['i-solar:book-bookmark-bold-duotone', 'text-lg', 'text-neutral-500']" />
                <span :class="['text-sm', 'font-medium', 'text-neutral-700', 'dark:text-neutral-200']">{{ tn('chat-diagnostics.recall.title') }}</span>
              </div>
              <span :class="['rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium', recallStatusBadgeClass]">
                {{ recallStatusLabel }}
              </span>
            </div>
            <div :class="['flex', 'flex-col', 'gap-1']">
              <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                {{ tn('chat-diagnostics.recall.time', { time: formatAttemptTime(recallDiagnostics.at) }) }}
              </span>
              <p :class="['break-words', 'text-xs', 'text-neutral-600', 'leading-5', 'dark:text-neutral-300']">
                {{ recallDetail }}
              </p>
              <div v-if="hasRecallContextPreview" :class="['mt-2', 'flex', 'flex-col', 'gap-2']">
                <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                  <span :class="['text-[10px]', 'font-medium', 'uppercase', 'text-neutral-400', 'dark:text-neutral-500']">
                    {{ tn('chat-diagnostics.recall.preview') }}
                  </span>
                  <span :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                    {{ formatCount(recallContextPreview.length) }}
                  </span>
                </div>
                <pre :class="['max-h-44', 'overflow-auto', 'whitespace-pre-wrap', 'break-words', 'rounded-md', 'bg-white/70', 'p-2', 'font-mono', 'text-[11px]', 'text-neutral-600', 'leading-4', 'dark:bg-neutral-900/70', 'dark:text-neutral-300']">{{ recallContextPreview }}</pre>
              </div>
            </div>
          </div>

          <div :class="['min-w-0', 'flex', 'flex-col', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-950/30']">
            <div :class="['flex', 'items-center', 'justify-between', 'gap-3']">
              <div :class="['flex', 'items-center', 'gap-2']">
                <div :class="['i-solar:database-bold-duotone', 'text-lg', 'text-neutral-500']" />
                <span :class="['text-sm', 'font-medium', 'text-neutral-700', 'dark:text-neutral-200']">{{ tn('chat-diagnostics.ingest.title') }}</span>
              </div>
              <span :class="['rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium', ingestStatusBadgeClass]">
                {{ ingestStatusLabel }}
              </span>
            </div>
            <div :class="['flex', 'flex-col', 'gap-1']">
              <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                {{ tn('chat-diagnostics.ingest.time', { time: formatAttemptTime(ingestDiagnostics.at) }) }}
              </span>
              <p :class="['break-words', 'text-xs', 'text-neutral-600', 'leading-5', 'dark:text-neutral-300']">
                {{ ingestDetail }}
              </p>
            </div>
          </div>
        </div>

        <div :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-950/30']">
          <div :class="['flex', 'items-center', 'justify-between', 'gap-3']">
            <div :class="['flex', 'items-center', 'gap-2']">
              <div :class="['i-solar:layers-minimalistic-bold-duotone', 'text-lg', 'text-neutral-500']" />
              <span :class="['text-sm', 'font-medium', 'text-neutral-700', 'dark:text-neutral-200']">
                {{ tn('chat-diagnostics.contexts.title') }}
              </span>
            </div>
            <span :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
              {{ formatCount(contextDiagnostics.length) }}
            </span>
          </div>

          <div v-if="contextDiagnostics.length === 0" :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            {{ tn('chat-diagnostics.contexts.empty') }}
          </div>

          <div v-else :class="['grid', 'grid-cols-1', 'gap-2', 'xl:grid-cols-3']">
            <div
              v-for="context in contextDiagnostics"
              :key="context.source"
              :class="['min-w-0', 'flex', 'flex-col', 'gap-2', 'rounded-md', 'bg-white/70', 'p-2.5', 'dark:bg-neutral-900/70']"
            >
              <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                <span :class="['text-xs', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                  {{ contextSourceLabel(context.source) }}
                </span>
                <span :class="['rounded-full', 'px-2', 'py-0.5', 'text-[10px]', 'font-medium', chatAttemptBadgeClass(context.status)]">
                  {{ tn(`chat-diagnostics.recall.status.${context.status}`) }}
                </span>
              </div>

              <div :class="['flex', 'flex-wrap', 'gap-x-3', 'gap-y-1', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                <span>{{ tn('chat-diagnostics.contexts.time', { time: formatAttemptTime(context.at) }) }}</span>
                <span>{{ tn('chat-diagnostics.contexts.characters', { characters: context.contextCharacters ?? 0 }) }}</span>
                <span v-if="context.queryCharacters != null">{{ tn('chat-diagnostics.contexts.query', { characters: context.queryCharacters }) }}</span>
              </div>

              <p v-if="context.error" :class="['break-words', 'text-xs', 'text-red-600', 'leading-5', 'dark:text-red-300']">
                {{ context.error }}
              </p>

              <pre
                v-if="context.contextBlock?.trim()"
                :class="['max-h-36', 'overflow-auto', 'whitespace-pre-wrap', 'break-words', 'rounded-md', 'bg-neutral-100/70', 'p-2', 'font-mono', 'text-[11px]', 'text-neutral-600', 'leading-4', 'dark:bg-neutral-950/50', 'dark:text-neutral-300']"
              >{{ context.contextBlock.trim() }}</pre>
            </div>
          </div>
        </div>
      </section>

      <section
        v-else-if="activeDetailPanel === 'tools'"
        :class="[
          'flex',
          'flex-col',
          'gap-4',
          'rounded-lg',
          'border',
          'border-neutral-200/70',
          'bg-white/70',
          'p-3',
          'dark:border-neutral-800/70',
          'dark:bg-neutral-900/30',
        ]"
      >
        <div :class="['flex', 'items-center', 'gap-2']">
          <div :class="['i-solar:toolbox-bold-duotone', 'text-xl', 'text-primary-500', 'dark:text-primary-300']" />
          <h3 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
            {{ tn('tools.title') }}
          </h3>
        </div>

        <div :class="['grid', 'grid-cols-1', 'gap-3', 'xl:grid-cols-2']">
          <section :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-950/30']">
            <div :class="['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-3']">
              <div :class="['flex', 'items-start', 'gap-2']">
                <div :class="['i-solar:import-bold-duotone', 'mt-0.5', 'text-lg', 'text-neutral-500']" />
                <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
                  <h4 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                    {{ tn('manual-import.title') }}
                  </h4>
                  <p :class="['text-xs', 'text-neutral-500', 'leading-5', 'dark:text-neutral-400']">
                    {{ tn('manual-import.description', { count: importableChatMessages.length }) }}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                :loading="isManualImporting"
                icon="i-solar:upload-square-bold-duotone"
                :label="tn('manual-import.action')"
                @click="importRecentChatMessages"
              />
            </div>

            <FieldInput
              v-model="manualImportMessageLimit"
              type="number"
              :label="tn('manual-import.limit.label')"
              :description="tn('manual-import.limit.description')"
              placeholder="20"
            />
            <Callout v-if="manualImportError" theme="orange" :label="tn('manual-import.error')">
              {{ manualImportError }}
            </Callout>
            <Callout v-else-if="manualImportMessage" theme="lime" :label="manualImportMessage">
              {{ tn('manual-import.saved-description') }}
            </Callout>
          </section>

          <section :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-950/30']">
            <div :class="['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-3']">
              <div :class="['flex', 'items-start', 'gap-2']">
                <div :class="['i-solar:magnifer-bold-duotone', 'mt-0.5', 'text-lg', 'text-neutral-500']" />
                <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
                  <h4 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                    {{ tn('recall-preview.title') }}
                  </h4>
                  <p :class="['text-xs', 'text-neutral-500', 'leading-5', 'dark:text-neutral-400']">
                    {{ tn('recall-preview.description') }}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                :loading="isPreviewingRecall"
                icon="i-solar:eye-bold-duotone"
                :label="tn('recall-preview.action')"
                @click="previewMemoryRecall"
              />
            </div>

            <FieldInput
              v-model="previewQuery"
              :label="tn('recall-preview.query.label')"
              :description="tn('recall-preview.query.description')"
              :placeholder="tn('recall-preview.query.placeholder')"
            />
            <Callout v-if="previewError" theme="orange" :label="tn('recall-preview.error')">
              {{ previewError }}
            </Callout>
            <div
              v-if="previewResult"
              :class="['grid', 'grid-cols-2', 'gap-2']"
            >
              <div :class="['rounded-md', 'bg-white/70', 'p-2.5', 'dark:bg-neutral-900/70']">
                <span :class="['text-[10px]', 'font-medium', 'uppercase', 'text-neutral-400', 'dark:text-neutral-500']">{{ tn('recall-preview.semantic') }}</span>
                <span :class="['block', 'font-mono', 'text-lg', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">{{ formatCount(previewResult.semantic.length) }}</span>
              </div>
              <div :class="['rounded-md', 'bg-white/70', 'p-2.5', 'dark:bg-neutral-900/70']">
                <span :class="['text-[10px]', 'font-medium', 'uppercase', 'text-neutral-400', 'dark:text-neutral-500']">{{ tn('recall-preview.episodic') }}</span>
                <span :class="['block', 'font-mono', 'text-lg', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">{{ formatCount(previewResult.episodic.length) }}</span>
              </div>
            </div>
            <div v-if="previewResult" :class="['flex', 'flex-col', 'gap-2', 'max-h-72', 'overflow-y-auto']">
              <div
                v-for="memory in previewResult.semantic"
                :key="`semantic-${memory.id}`"
                :class="['rounded-md', 'bg-white/70', 'p-2.5', 'dark:bg-neutral-900/70']"
              >
                <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                  <span :class="['text-xs', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">{{ memory.category || tn('semantic-memories.uncategorized') }}</span>
                  <span :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">{{ memory.score.toFixed(4) }}</span>
                </div>
                <p :class="['mt-1', 'line-clamp-3', 'text-xs', 'text-neutral-600', 'leading-5', 'dark:text-neutral-300']">
                  {{ memory.fact }}
                </p>
              </div>
              <div
                v-for="memory in previewResult.episodic"
                :key="`episodic-${memory.id}`"
                :class="['rounded-md', 'bg-white/70', 'p-2.5', 'dark:bg-neutral-900/70']"
              >
                <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                  <span :class="['text-xs', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">{{ memory.title || tn('recent-memories.untitled') }}</span>
                  <span :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">{{ memory.score.toFixed(4) }}</span>
                </div>
                <p :class="['mt-1', 'line-clamp-3', 'text-xs', 'text-neutral-600', 'leading-5', 'dark:text-neutral-300']">
                  {{ memory.content }}
                </p>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section
        v-else-if="activeDetailPanel === 'recent'"
        :class="[
          'flex',
          'flex-col',
          'gap-4',
          'rounded-lg',
          'border',
          'border-neutral-200/70',
          'bg-white/70',
          'p-3',
          'dark:border-neutral-800/70',
          'dark:bg-neutral-900/30',
        ]"
      >
        <div :class="['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-3']">
          <div :class="['flex', 'items-center', 'gap-2']">
            <div :class="['i-solar:brain-bold-duotone', 'text-xl', 'text-primary-500', 'dark:text-primary-300']" />
            <h3 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
              {{ tn('recent-memories.title') }}
            </h3>
          </div>
          <Button
            variant="secondary" size="sm" :loading="isLoadingRecentMemories"
            icon="i-solar:refresh-bold-duotone" :label="tn('recent-memories.refresh')"
            @click="refreshRecentMemories"
          />
        </div>

        <Callout v-if="recentMemoriesError" theme="orange" :label="tn('recent-memories.error')">
          {{ recentMemoriesError }}
        </Callout>

        <div v-if="recentMemories.length === 0 && !recentMemoriesError && !isLoadingRecentMemories" :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
          {{ tn('recent-memories.empty') }}
        </div>

        <div :class="['flex', 'flex-col', 'gap-2', 'max-h-80', 'overflow-y-auto']">
          <div
            v-for="memory in recentMemories"
            :key="memory.id"
            :class="[
              'flex',
              'flex-col',
              'gap-1.5',
              'rounded-md',
              'border',
              'border-neutral-200/50',
              'bg-neutral-50/70',
              'p-2.5',
              'dark:border-neutral-800/50',
              'dark:bg-neutral-950/30',
            ]"
          >
            <div :class="['flex', 'items-start', 'justify-between', 'gap-2']">
              <span :class="['text-sm', 'font-medium', 'text-neutral-700', 'dark:text-neutral-200']">
                {{ memory.title || tn('recent-memories.untitled') }}
              </span>
              <span
                v-if="memory.classification"
                :class="[
                  'shrink-0', 'rounded-full', 'px-1.5', 'py-0.5', 'text-[10px]', 'font-medium',
                  memory.classification === 'informative'
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300',
                ]"
              >
                {{ classificationLabel(memory.classification) }}
              </span>
            </div>
            <p :class="['text-xs', 'text-neutral-500', 'leading-4', 'dark:text-neutral-400', 'line-clamp-3']">
              {{ memory.content }}
            </p>
            <div :class="['flex', 'flex-wrap', 'gap-x-3', 'gap-y-1', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
              <span>{{ tn('recent-memories.created', { time: formatMemoryTime(memory.created_at) }) }}</span>
              <span v-if="memory.surprise != null && memory.surprise > 0">{{ tn('recent-memories.surprise', { value: memory.surprise.toFixed(2) }) }}</span>
              <span v-if="memory.consolidated_at">{{ tn('recent-memories.consolidated') }}</span>
            </div>
          </div>
        </div>
      </section>

      <section
        v-else-if="activeDetailPanel === 'semantic'"
        :class="[
          'flex',
          'flex-col',
          'gap-4',
          'rounded-lg',
          'border',
          'border-neutral-200/70',
          'bg-white/70',
          'p-3',
          'dark:border-neutral-800/70',
          'dark:bg-neutral-900/30',
        ]"
      >
        <div :class="['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-3']">
          <div :class="['flex', 'items-center', 'gap-2']">
            <div :class="['i-solar:document-add-bold-duotone', 'text-xl', 'text-primary-500', 'dark:text-primary-300']" />
            <h3 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
              {{ tn('semantic-memories.title') }}
            </h3>
          </div>
          <div :class="['flex', 'flex-wrap', 'items-center', 'justify-end', 'gap-2']">
            <div :class="['min-w-52']">
              <FieldCheckbox
                v-model="includeInvalidSemanticMemories"
                :label="tn('semantic-memories.include-invalid.label')"
                :description="tn('semantic-memories.include-invalid.description')"
              />
            </div>
            <Button
              variant="secondary" size="sm" :loading="isLoadingSemanticMemories"
              icon="i-solar:refresh-bold-duotone" :label="tn('semantic-memories.refresh')"
              @click="refreshSemanticMemories"
            />
          </div>
        </div>

        <Callout v-if="semanticMemoriesError" theme="orange" :label="tn('semantic-memories.error')">
          {{ semanticMemoriesError }}
        </Callout>

        <div v-if="semanticMemories.length === 0 && !semanticMemoriesError && !isLoadingSemanticMemories" :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
          {{ tn('semantic-memories.empty') }}
        </div>

        <div :class="['flex', 'flex-col', 'gap-2', 'max-h-96', 'overflow-y-auto']">
          <div
            v-for="memory in semanticMemories"
            :key="memory.id"
            :class="[
              'flex',
              'flex-col',
              'gap-2',
              'rounded-md',
              'border',
              'border-neutral-200/50',
              'bg-neutral-50/70',
              'p-2.5',
              'dark:border-neutral-800/50',
              'dark:bg-neutral-950/30',
            ]"
          >
            <div :class="['flex', 'flex-wrap', 'items-start', 'justify-between', 'gap-2']">
              <div :class="['flex', 'flex-wrap', 'items-center', 'gap-1.5']">
                <span :class="['rounded-full', 'bg-sky-500/15', 'px-1.5', 'py-0.5', 'text-[10px]', 'font-medium', 'text-sky-700', 'dark:text-sky-300']">
                  {{ memory.category || tn('semantic-memories.uncategorized') }}
                </span>
                <span :class="['rounded-full', 'px-1.5', 'py-0.5', 'text-[10px]', 'font-medium', semanticMemoryStatusBadgeClass(memory)]">
                  {{ semanticMemoryStatusLabel(memory) }}
                </span>
              </div>
              <span :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                {{ memory.id.slice(0, 8) }}
              </span>
            </div>

            <p :class="['break-words', 'text-sm', 'text-neutral-700', 'leading-5', 'dark:text-neutral-200']">
              {{ memory.fact }}
            </p>

            <div :class="['flex', 'flex-wrap', 'gap-x-3', 'gap-y-1', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
              <span>{{ tn('semantic-memories.created', { time: formatMemoryTime(memory.created_at) }) }}</span>
              <span>{{ tn('semantic-memories.valid-at', { time: formatMemoryTime(memory.valid_at) }) }}</span>
              <span v-if="memory.invalid_at">{{ tn('semantic-memories.invalid-at', { time: formatMemoryTime(memory.invalid_at) }) }}</span>
              <span>{{ tn('semantic-memories.sources', { count: memory.source_episodic_ids.length }) }}</span>
            </div>

            <div :class="['flex', 'flex-wrap', 'justify-end', 'gap-2']">
              <Button
                variant="secondary"
                size="sm"
                icon="i-solar:link-round-angle-bold-duotone"
                :disabled="memory.source_episodic_ids.length === 0"
                :label="tn('semantic-memories.actions.sources')"
                @click="showSemanticMemorySources(memory)"
              />
              <Button
                :variant="memory.invalid_at ? 'secondary' : 'caution'"
                size="sm"
                :loading="mutatingSemanticMemoryId === memory.id"
                :icon="memory.invalid_at ? 'i-solar:restart-bold-duotone' : 'i-solar:trash-bin-minimalistic-bold-duotone'"
                :label="memory.invalid_at ? tn('semantic-memories.actions.restore') : tn('semantic-memories.actions.invalidate')"
                @click="setSemanticMemoryInvalid(memory, !memory.invalid_at)"
              />
            </div>
          </div>
        </div>

        <section
          v-if="selectedSourceMemoryIds.length > 0"
          :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-950/30']"
        >
          <div :class="['flex', 'items-center', 'justify-between', 'gap-3']">
            <div :class="['flex', 'items-center', 'gap-2']">
              <div :class="['i-solar:link-round-angle-bold-duotone', 'text-lg', 'text-neutral-500']" />
              <span :class="['text-sm', 'font-medium', 'text-neutral-700', 'dark:text-neutral-200']">
                {{ tn('semantic-memories.sources-view.title') }}
              </span>
            </div>
            <span :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
              {{ formatCount(selectedSourceMemoryIds.length) }}
            </span>
          </div>
          <div v-if="selectedSourceMemories.length === 0" :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            {{ tn('semantic-memories.sources-view.empty') }}
          </div>
          <div v-else :class="['flex', 'flex-col', 'gap-2', 'max-h-64', 'overflow-y-auto']">
            <div
              v-for="memory in selectedSourceMemories"
              :key="memory.id"
              :class="['rounded-md', 'bg-white/70', 'p-2.5', 'dark:bg-neutral-900/70']"
            >
              <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                <span :class="['text-xs', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">{{ memory.title || tn('recent-memories.untitled') }}</span>
                <span :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">{{ memory.id.slice(0, 8) }}</span>
              </div>
              <p :class="['mt-1', 'whitespace-pre-wrap', 'break-words', 'text-xs', 'text-neutral-600', 'leading-5', 'dark:text-neutral-300']">
                {{ memory.content }}
              </p>
            </div>
          </div>
          <div v-if="missingSourceMemoryIds.length > 0" :class="['text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
            {{ tn('semantic-memories.sources-view.missing', { count: missingSourceMemoryIds.length }) }}
          </div>
        </section>
      </section>

      <section
        v-else-if="activeDetailPanel === 'about'"
        :class="[
          'flex',
          'flex-col',
          'gap-4',
          'rounded-lg',
          'border',
          'border-neutral-200/70',
          'bg-white/70',
          'p-3',
          'dark:border-neutral-800/70',
          'dark:bg-neutral-900/30',
        ]"
      >
        <div :class="['grid', 'grid-cols-1', 'gap-3', 'lg:grid-cols-3']">
          <div
            v-for="fact in bridgeFacts"
            :key="fact.titleKey"
            :class="[
              'flex',
              'gap-3',
              'rounded-md',
              'bg-neutral-100/70',
              'p-3',
              'dark:bg-neutral-950/30',
            ]"
          >
            <div :class="[fact.icon, 'mt-0.5', 'text-xl', 'text-primary-500', 'dark:text-primary-300']" />
            <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
              <h3 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                {{ t(fact.titleKey) }}
              </h3>
              <p :class="['text-sm', 'text-neutral-500', 'leading-5', 'dark:text-neutral-400']">
                {{ t(fact.descriptionKey) }}
              </p>
            </div>
          </div>
        </div>

        <div :class="['flex', 'flex-col', 'gap-3']">
          <h3 :class="['text-sm', 'font-semibold', 'text-neutral-600', 'dark:text-neutral-300']">
            {{ t('settings.pages.modules.memory-long-term.sections.plast-mem-bridge.env.title') }}
          </h3>
          <div :class="['flex', 'flex-wrap', 'gap-2']">
            <code
              v-for="envVar in bridgeEnvVars"
              :key="envVar"
              :class="[
                'rounded-md',
                'bg-neutral-200/70',
                'px-2',
                'py-1',
                'text-xs',
                'text-neutral-700',
                'dark:bg-neutral-800/80',
                'dark:text-neutral-300',
              ]"
            >
              {{ envVar }}
            </code>
          </div>
        </div>
      </section>
    </section>
  </div>

  <div
    v-motion
    :class="[
      'pointer-events-none',
      'fixed',
      'bottom-0',
      'right-[-1.25rem]',
      'top-[calc(100dvh-15rem)]',
      'z-[-1]',
      'size-60',
      'flex',
      'items-center',
      'justify-center',
      'text-neutral-200/50',
      'dark:text-neutral-600/20',
    ]"
    :initial="{ scale: 0.9, opacity: 0, x: 20 }"
    :enter="{ scale: 1, opacity: 1, x: 0 }"
    :duration="500"
  >
    <div :class="['i-solar:book-bookmark-bold-duotone', 'text-[60px]']" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory-long-term.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
