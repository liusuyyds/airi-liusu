<script setup lang="ts">
import type {
  ChatHistoryItem,
} from '@proj-airi/stage-ui/types/chat'

import type {
  ElectronPlastMemChatMessage,
  ElectronPlastMemConfig,
  ElectronPlastMemConversationMessage,
  ElectronPlastMemEpisodeSpan,
  ElectronPlastMemEpisodicMemory,
  ElectronPlastMemFailedReviewJob,
  ElectronPlastMemHealthResult,
  ElectronPlastMemPendingReviewQueueItem,
  ElectronPlastMemPendingReviewQueueMemory,
  ElectronPlastMemRetrieveMemoryRawResult,
  ElectronPlastMemRuntimeStatus,
  ElectronPlastMemSemanticMemory,
  ElectronPlastMemSidecarStatus,
} from '../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { Button, Callout, Collapsible, DoubleCheckButton, FieldInput, Textarea } from '@proj-airi/ui'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MemoryLongTermAboutPanel from './components/memoryLongTermAboutPanel.vue'
import MemoryLongTermConfigPanel from './components/memoryLongTermConfigPanel.vue'
import MemoryLongTermDiagnosticsPanel from './components/memoryLongTermDiagnosticsPanel.vue'
import MemoryLongTermRecentPanel from './components/memoryLongTermRecentPanel.vue'
import MemoryLongTermRuntimePanel from './components/memoryLongTermRuntimePanel.vue'
import MemoryLongTermToolsPanel from './components/memoryLongTermToolsPanel.vue'

import {
  defaultElectronPlastMemConfig,
  electronPlastMemApplyConfig,
  electronPlastMemApprovePendingReviewQueueItem,
  electronPlastMemConversationMessages,
  electronPlastMemDeleteSemanticMemory,
  electronPlastMemDismissPendingReviewQueueItem,
  electronPlastMemEpisodeSpans,
  electronPlastMemFailedReviewJobs,
  electronPlastMemGetConfig,
  electronPlastMemGetRuntimeStatus,
  electronPlastMemGetSidecarStatus,
  electronPlastMemHealth,
  electronPlastMemIngestChatMessages,
  electronPlastMemPendingReviewQueue,
  electronPlastMemRecentMemoryRaw,
  electronPlastMemRestartSidecar,
  electronPlastMemRetrieveMemoryRaw,
  electronPlastMemRetryFailedReviewJob,
  electronPlastMemRewritePendingReviewQueueItem,
  electronPlastMemSemanticMemoryRaw,
  electronPlastMemSetSemanticMemoryInvalid,
  electronPlastMemStartSidecar,
  electronPlastMemStopSidecar,
  electronPlastMemUpdateConversationMessage,
  electronPlastMemUpdateEpisodicMemory,
  electronPlastMemUpdatePendingReviewQueueMemory,
  electronPlastMemUpdateSemanticMemory,
} from '../../../../shared/eventa'

type ConfigSaveSyncMode = 'always' | 'ifStable' | 'never'
type DetailPanelId = 'config' | 'runtime' | 'diagnostics' | 'tools' | 'recent' | 'health' | 'about'
type HealthInspectorId = 'conversation-messages' | 'episode-spans' | 'episodic-memories' | 'semantic-memories' | 'active-semantic-memories' | 'pending-reviews'

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
const invokeConversationMessages = useElectronEventaInvoke(electronPlastMemConversationMessages)
const invokeUpdateConversationMessage = useElectronEventaInvoke(electronPlastMemUpdateConversationMessage)
const invokeEpisodeSpans = useElectronEventaInvoke(electronPlastMemEpisodeSpans)
const invokeIngestChatMessages = useElectronEventaInvoke(electronPlastMemIngestChatMessages)
const invokeRecentMemoryRaw = useElectronEventaInvoke(electronPlastMemRecentMemoryRaw)
const invokeUpdateEpisodicMemory = useElectronEventaInvoke(electronPlastMemUpdateEpisodicMemory)
const invokeRetrieveMemoryRaw = useElectronEventaInvoke(electronPlastMemRetrieveMemoryRaw)
const invokeSemanticMemoryRaw = useElectronEventaInvoke(electronPlastMemSemanticMemoryRaw)
const invokePendingReviewQueue = useElectronEventaInvoke(electronPlastMemPendingReviewQueue)
const invokeFailedReviewJobs = useElectronEventaInvoke(electronPlastMemFailedReviewJobs)
const invokeRetryFailedReviewJob = useElectronEventaInvoke(electronPlastMemRetryFailedReviewJob)
const invokeRewritePendingReviewQueueItem = useElectronEventaInvoke(electronPlastMemRewritePendingReviewQueueItem)
const invokeApprovePendingReviewQueueItem = useElectronEventaInvoke(electronPlastMemApprovePendingReviewQueueItem)
const invokeDismissPendingReviewQueueItem = useElectronEventaInvoke(electronPlastMemDismissPendingReviewQueueItem)
const invokeUpdatePendingReviewQueueMemory = useElectronEventaInvoke(electronPlastMemUpdatePendingReviewQueueMemory)
const invokeSetSemanticMemoryInvalid = useElectronEventaInvoke(electronPlastMemSetSemanticMemoryInvalid)
const invokeUpdateSemanticMemory = useElectronEventaInvoke(electronPlastMemUpdateSemanticMemory)
const invokeDeleteSemanticMemory = useElectronEventaInvoke(electronPlastMemDeleteSemanticMemory)
const chatSessionStore = useChatSessionStore()
const { activeCard } = storeToRefs(useAiriCardStore())

const reviewWindowOptions = [
  { label: '24h', value: 24 },
  { label: '12h', value: 12 },
  { label: '6h', value: 6 },
  { label: '1h', value: 1 },
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
const pendingReviewItems = ref<ElectronPlastMemPendingReviewQueueItem[]>([])
const failedReviewJobs = ref<ElectronPlastMemFailedReviewJob[]>([])
const pendingReviewError = ref('')
const isLoadingPendingReviewItems = ref(false)
const isLoadingFailedReviewJobs = ref(false)
const mutatingPendingReviewItemId = ref('')
const mutatingFailedReviewJobId = ref('')
const expandedFailedReviewJobIds = ref<string[]>([])
const editingPendingReviewItemId = ref('')
const pendingReviewDraftQuery = ref('')
const editingPendingReviewMemoryKey = ref('')
const pendingReviewMemoryDraftTitle = ref('')
const pendingReviewMemoryDraftContent = ref('')
const conversationMessages = ref<ElectronPlastMemConversationMessage[]>([])
const conversationMessagesError = ref('')
const isLoadingConversationMessages = ref(false)
const editingConversationMessageSeq = ref<number>()
const mutatingConversationMessageSeq = ref<number>()
const conversationMessageDraftRole = ref('')
const conversationMessageDraftSpeakerName = ref('')
const conversationMessageDraftContent = ref('')
const conversationMessageDraftTimestamp = ref('')
const episodeSpans = ref<ElectronPlastMemEpisodeSpan[]>([])
const episodeSpansError = ref('')
const isLoadingEpisodeSpans = ref(false)
const recentMemories = ref<ElectronPlastMemEpisodicMemory[]>([])
const recentMemoriesError = ref('')
const isLoadingRecentMemories = ref(false)
const editingRecentMemoryId = ref('')
const mutatingRecentMemoryId = ref('')
const recentMemoryDraftTitle = ref('')
const recentMemoryDraftContent = ref('')
const semanticMemories = ref<ElectronPlastMemSemanticMemory[]>([])
const semanticMemoriesError = ref('')
const isLoadingSemanticMemories = ref(false)
const mutatingSemanticMemoryId = ref('')
const editingSemanticMemoryId = ref('')
const semanticMemoryDraftCategory = ref('')
const semanticMemoryDraftFact = ref('')
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
const activeHealthInspector = ref<HealthInspectorId>()
const activeDetailPanel = ref<DetailPanelId>('config')
let refreshTimer: ReturnType<typeof setInterval> | undefined
let activeSavePromise: Promise<boolean> | undefined
let pendingConfigSave = false
let pendingConfigRefreshAfterSave = false
let pendingConfigShowSavedMessage = false
let pendingConfigSyncDraft: ConfigSaveSyncMode = 'never'
let suppressConfigAutoSave = false
let configDraftRevision = 0

const normalizedManualImportMessageLimit = computed(() => Math.max(1, Number(manualImportMessageLimit.value) || 20))
const manualImportAssistantName = computed(() => assistantNameFromCard(activeCard.value))
const importableChatMessages = computed(() => chatSessionStore.messages
  .map(message => toPlastMemChatMessage(message, manualImportAssistantName.value))
  .filter((message): message is ElectronPlastMemChatMessage => Boolean(message))
  .slice(-normalizedManualImportMessageLimit.value))
const selectedSourceMemories = computed(() => recentMemories.value.filter(memory => selectedSourceMemoryIds.value.includes(memory.id)))
const missingSourceMemoryIds = computed(() => selectedSourceMemoryIds.value.filter(id => !selectedSourceMemories.value.some(memory => memory.id === id)))
const healthServiceOk = computed(() => Boolean(health.value && !health.value.error))
const healthCheckedAt = computed(() => health.value?.serverTime ? new Date(health.value.serverTime).toLocaleTimeString() : '-')
const healthServiceBadgeClass = computed(() => healthStatusBadgeClass(healthServiceOk.value ? true : health.value ? false : undefined))
const healthDatabaseBadgeClass = computed(() => healthStatusBadgeClass(health.value?.databaseOk))
const healthChatModelBadgeClass = computed(() => healthStatusBadgeClass(health.value?.modelHealth?.chat.ok))
const healthEmbeddingModelBadgeClass = computed(() => healthStatusBadgeClass(health.value?.modelHealth?.embedding.ok))
const healthCounts = computed(() => health.value?.counts)
const duePendingReviewCount = computed(() => healthCounts.value?.due_pending_reviews ?? 0)
const deferredPendingReviewCount = computed(() => healthCounts.value?.deferred_pending_reviews ?? 0)
const duePendingReviewItems = computed(() => pendingReviewItems.value.filter(item => item.review_status === 'due'))
const deferredPendingReviewItems = computed(() => pendingReviewItems.value.filter(item => item.review_status === 'deferred'))
const failedReviewJobCount = computed(() => failedReviewJobs.value.length)
const failedReviewPreviewLimit = 4
const modelHealthError = computed(() => {
  const modelHealth = health.value?.modelHealth
  if (!modelHealth)
    return ''

  const errors = [
    modelHealth.chat.ok ? '' : formatProviderError(tn('health.chat-model'), modelHealth.chat.error),
    modelHealth.embedding.ok ? '' : formatProviderError(tn('health.embedding-model'), modelHealth.embedding.error),
  ].filter(Boolean)

  return errors.join('\n')
})
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
function healthStatusBadgeClass(ok: boolean | undefined) {
  if (ok === true)
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if (ok === false)
    return 'bg-red-500/15 text-red-700 dark:text-red-300'

  return 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300'
}

function extractErrorCode(error: string) {
  return error.match(/"code"\s*:\s*"?([^",}\s]+)/)?.[1]
    ?? error.match(/\bcode[:=]\s*([\w.-]+)/i)?.[1]
}

function formatProviderError(label: string, error: string | undefined) {
  const message = error?.trim() || tn('health.model-error-empty')
  const code = extractErrorCode(message)

  return code
    ? `${label}: ${tn('health.error-code', { code })} ${message}`
    : `${label}: ${message}`
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

function trimOptional(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function assistantNameFromCard(card: { name?: string, nickname?: string } | undefined) {
  return trimOptional(card?.nickname) ?? trimOptional(card?.name)
}

function speakerNameFromChatMessage(message: ChatHistoryItem, fallbackAssistantName?: string) {
  if (message.role !== 'assistant')
    return undefined

  const messageName = hasRecordShape(message) && typeof message.name === 'string'
    ? trimOptional(message.name)
    : undefined

  return messageName ?? fallbackAssistantName
}

function toPlastMemChatMessage(message: ChatHistoryItem, assistantName?: string): ElectronPlastMemChatMessage | undefined {
  if (message.role !== 'user' && message.role !== 'assistant')
    return undefined

  const content = textFromUnknown(message).trim()
  if (!content)
    return undefined

  const createdAt = hasRecordShape(message) && typeof message.createdAt === 'number'
    ? message.createdAt
    : undefined
  const speakerName = speakerNameFromChatMessage(message, assistantName)

  return {
    content,
    role: message.role,
    ...(speakerName ? { name: speakerName } : {}),
    ...(createdAt ? { timestamp: createdAt } : {}),
  }
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
      refreshHealth(true),
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

async function refreshHealth(includeModelHealth = false) {
  if (isCheckingHealth.value)
    return

  isCheckingHealth.value = true
  healthError.value = ''
  try {
    const result = await invokePlastMemHealth({ includeModelHealth })
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

async function refreshConversationMessages() {
  if (isLoadingConversationMessages.value)
    return

  isLoadingConversationMessages.value = true
  conversationMessagesError.value = ''
  try {
    const result = await invokeConversationMessages({ limit: 200 })
    if (result.error) {
      conversationMessagesError.value = result.error
      conversationMessages.value = []
      return
    }

    conversationMessages.value = result.messages
  }
  catch (error) {
    conversationMessagesError.value = errorMessageFrom(error) ?? 'Unknown error'
    conversationMessages.value = []
  }
  finally {
    isLoadingConversationMessages.value = false
  }
}

async function refreshEpisodeSpans() {
  if (isLoadingEpisodeSpans.value)
    return

  isLoadingEpisodeSpans.value = true
  episodeSpansError.value = ''
  try {
    const result = await invokeEpisodeSpans({ limit: 200 })
    if (result.error) {
      episodeSpansError.value = result.error
      episodeSpans.value = []
      return
    }

    episodeSpans.value = result.spans
  }
  catch (error) {
    episodeSpansError.value = errorMessageFrom(error) ?? 'Unknown error'
    episodeSpans.value = []
  }
  finally {
    isLoadingEpisodeSpans.value = false
  }
}

async function refreshPendingReviewItems() {
  if (isLoadingPendingReviewItems.value)
    return

  isLoadingPendingReviewItems.value = true
  pendingReviewError.value = ''
  try {
    const result = await invokePendingReviewQueue({ limit: 20 })
    if (result.error) {
      pendingReviewError.value = result.error
      pendingReviewItems.value = []
      return
    }

    pendingReviewItems.value = result.items
    if (editingPendingReviewItemId.value && !result.items.some(item => item.id === editingPendingReviewItemId.value))
      resetPendingReviewEditor()
  }
  catch (error) {
    pendingReviewError.value = errorMessageFrom(error) ?? 'Unknown error'
    pendingReviewItems.value = []
  }
  finally {
    isLoadingPendingReviewItems.value = false
  }
}

async function refreshFailedReviewJobs() {
  if (isLoadingFailedReviewJobs.value)
    return

  isLoadingFailedReviewJobs.value = true
  try {
    const result = await invokeFailedReviewJobs({ limit: 20 })
    if (result.error) {
      failedReviewJobs.value = []
      pendingReviewError.value = result.error
      return
    }

    failedReviewJobs.value = result.jobs
  }
  catch (error) {
    pendingReviewError.value = errorMessageFrom(error) ?? 'Unknown error'
    failedReviewJobs.value = []
  }
  finally {
    isLoadingFailedReviewJobs.value = false
  }
}

async function openHealthCountInspector(key: HealthInspectorId) {
  activeHealthInspector.value = activeHealthInspector.value === key ? undefined : key
  if (activeHealthInspector.value !== key)
    return

  if (key === 'conversation-messages') {
    await refreshConversationMessages()
    return
  }
  if (key === 'episode-spans') {
    await refreshEpisodeSpans()
    return
  }
  if (key === 'episodic-memories') {
    await refreshRecentMemories()
    return
  }
  if (key === 'semantic-memories' || key === 'active-semantic-memories') {
    await refreshSemanticMemories()
    return
  }
  if (key === 'pending-reviews') {
    await refreshPendingReviewItems()
    await refreshFailedReviewJobs()
  }
}

function resetConversationMessageEditor() {
  editingConversationMessageSeq.value = undefined
  mutatingConversationMessageSeq.value = undefined
  conversationMessageDraftRole.value = ''
  conversationMessageDraftSpeakerName.value = ''
  conversationMessageDraftContent.value = ''
  conversationMessageDraftTimestamp.value = ''
}

function beginConversationMessageEdit(message: ElectronPlastMemConversationMessage) {
  if (mutatingConversationMessageSeq.value != null)
    return

  editingConversationMessageSeq.value = message.seq
  conversationMessageDraftRole.value = message.role
  conversationMessageDraftSpeakerName.value = message.speaker_name ?? ''
  conversationMessageDraftContent.value = message.content
  conversationMessageDraftTimestamp.value = message.timestamp.slice(0, 16)
  conversationMessagesError.value = ''
}

async function saveConversationMessageEdit(message: ElectronPlastMemConversationMessage) {
  if (mutatingConversationMessageSeq.value != null)
    return

  const role = conversationMessageDraftRole.value.trim()
  const content = conversationMessageDraftContent.value.trim()
  const timestamp = conversationMessageDraftTimestamp.value.trim()
  if (!role || !content || !timestamp) {
    conversationMessagesError.value = tn('health.inspector.update-required')
    return
  }

  mutatingConversationMessageSeq.value = message.seq
  conversationMessagesError.value = ''
  try {
    const isoTimestamp = new Date(timestamp).toISOString()
    const result = await invokeUpdateConversationMessage({
      seq: message.seq,
      role,
      speakerName: conversationMessageDraftSpeakerName.value.trim(),
      content,
      timestamp: isoTimestamp,
    })
    if (result.error) {
      conversationMessagesError.value = result.error
      return
    }
    if (result.message) {
      conversationMessages.value = conversationMessages.value.map(item =>
        item.seq === result.message?.seq ? result.message : item,
      )
    }
    resetConversationMessageEditor()
  }
  catch (error) {
    conversationMessagesError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    mutatingConversationMessageSeq.value = undefined
  }
}

function resetRecentMemoryEditor() {
  editingRecentMemoryId.value = ''
  mutatingRecentMemoryId.value = ''
  recentMemoryDraftTitle.value = ''
  recentMemoryDraftContent.value = ''
}

function beginRecentMemoryEdit(memory: ElectronPlastMemEpisodicMemory) {
  if (mutatingRecentMemoryId.value)
    return

  editingRecentMemoryId.value = memory.id
  recentMemoryDraftTitle.value = memory.title
  recentMemoryDraftContent.value = memory.content
  recentMemoriesError.value = ''
}

async function saveRecentMemoryEdit(memory: ElectronPlastMemEpisodicMemory) {
  if (mutatingRecentMemoryId.value)
    return

  const title = recentMemoryDraftTitle.value.trim()
  const content = recentMemoryDraftContent.value.trim()
  if (!title || !content) {
    recentMemoriesError.value = tn('health.inspector.update-required')
    return
  }

  mutatingRecentMemoryId.value = memory.id
  recentMemoriesError.value = ''
  try {
    const result = await invokeUpdateEpisodicMemory({
      memoryId: memory.id,
      title,
      content,
    })
    if (result.error) {
      recentMemoriesError.value = result.error
      return
    }
    if (result.memory) {
      recentMemories.value = recentMemories.value.map(item =>
        item.id === result.memory?.id ? result.memory : item,
      )
    }
    resetRecentMemoryEditor()
  }
  catch (error) {
    recentMemoriesError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    mutatingRecentMemoryId.value = ''
  }
}

function resetPendingReviewEditor() {
  editingPendingReviewItemId.value = ''
  pendingReviewDraftQuery.value = ''
}

function resetPendingReviewMemoryEditor() {
  editingPendingReviewMemoryKey.value = ''
  pendingReviewMemoryDraftTitle.value = ''
  pendingReviewMemoryDraftContent.value = ''
}

function beginPendingReviewEdit(item: ElectronPlastMemPendingReviewQueueItem) {
  if (mutatingPendingReviewItemId.value)
    return

  editingPendingReviewItemId.value = item.id
  pendingReviewDraftQuery.value = item.query
  pendingReviewError.value = ''
}

function pendingReviewMemoryEditorKey(itemId: string, memoryId: string) {
  return `${itemId}:${memoryId}`
}

function failedReviewVisibleReviews(job: ElectronPlastMemFailedReviewJob) {
  if (expandedFailedReviewJobIds.value.includes(job.id))
    return job.review.pending_reviews

  return job.review.pending_reviews.slice(0, failedReviewPreviewLimit)
}

function failedReviewHiddenReviewCount(job: ElectronPlastMemFailedReviewJob) {
  if (expandedFailedReviewJobIds.value.includes(job.id))
    return 0

  return Math.max(0, job.review.pending_reviews.length - failedReviewPreviewLimit)
}

function failedReviewTotalMemoryCount(job: ElectronPlastMemFailedReviewJob) {
  return job.review.pending_reviews.reduce((total, review) => total + review.memory_count, 0)
}

function toggleFailedReviewQueries(job: ElectronPlastMemFailedReviewJob) {
  if (expandedFailedReviewJobIds.value.includes(job.id)) {
    expandedFailedReviewJobIds.value = expandedFailedReviewJobIds.value.filter(id => id !== job.id)
    return
  }

  expandedFailedReviewJobIds.value = [...expandedFailedReviewJobIds.value, job.id]
}

function beginPendingReviewMemoryEdit(item: ElectronPlastMemPendingReviewQueueItem, memory: ElectronPlastMemPendingReviewQueueMemory) {
  if (mutatingPendingReviewItemId.value)
    return

  editingPendingReviewMemoryKey.value = pendingReviewMemoryEditorKey(item.id, memory.id)
  pendingReviewMemoryDraftTitle.value = memory.title
  pendingReviewMemoryDraftContent.value = memory.content
  pendingReviewError.value = ''
}

async function savePendingReviewRewrite(item: ElectronPlastMemPendingReviewQueueItem) {
  if (mutatingPendingReviewItemId.value)
    return

  const query = pendingReviewDraftQuery.value.trim()
  if (!query) {
    pendingReviewError.value = tn('review-queue.editor.query-required')
    return
  }

  mutatingPendingReviewItemId.value = item.id
  pendingReviewError.value = ''
  try {
    const result = await invokeRewritePendingReviewQueueItem({
      itemId: item.id,
      query,
    })
    if (result.error) {
      pendingReviewError.value = result.error
      return
    }

    if (result.item) {
      pendingReviewItems.value = pendingReviewItems.value.map(current =>
        current.id === result.item?.id ? result.item : current,
      )
    }
    resetPendingReviewEditor()
  }
  catch (error) {
    pendingReviewError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    mutatingPendingReviewItemId.value = ''
  }
}

async function savePendingReviewMemoryEdit(item: ElectronPlastMemPendingReviewQueueItem, memory: ElectronPlastMemPendingReviewQueueMemory) {
  if (mutatingPendingReviewItemId.value)
    return

  const title = pendingReviewMemoryDraftTitle.value.trim()
  const content = pendingReviewMemoryDraftContent.value.trim()
  if (!title) {
    pendingReviewError.value = tn('review-queue.memory-editor.title-required')
    return
  }
  if (!content) {
    pendingReviewError.value = tn('review-queue.memory-editor.content-required')
    return
  }

  mutatingPendingReviewItemId.value = item.id
  pendingReviewError.value = ''
  try {
    const result = await invokeUpdatePendingReviewQueueMemory({
      itemId: item.id,
      memoryId: memory.id,
      title,
      content,
    })
    if (result.error) {
      pendingReviewError.value = result.error
      return
    }

    if (result.item) {
      pendingReviewItems.value = pendingReviewItems.value.map(current =>
        current.id === result.item?.id ? result.item : current,
      )
    }
    resetPendingReviewMemoryEditor()
  }
  catch (error) {
    pendingReviewError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    mutatingPendingReviewItemId.value = ''
  }
}

async function approvePendingReviewItem(item: ElectronPlastMemPendingReviewQueueItem) {
  if (mutatingPendingReviewItemId.value)
    return

  mutatingPendingReviewItemId.value = item.id
  pendingReviewError.value = ''
  try {
    const result = await invokeApprovePendingReviewQueueItem({
      itemId: item.id,
    })
    if (result.error) {
      pendingReviewError.value = result.error
      return
    }
    if (!result.consumed) {
      pendingReviewError.value = tn('review-queue.actions.approve-failed')
      return
    }

    if (editingPendingReviewItemId.value === item.id)
      resetPendingReviewEditor()
    pendingReviewItems.value = pendingReviewItems.value.filter(current => current.id !== item.id)
    await refreshHealth()
  }
  catch (error) {
    pendingReviewError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    mutatingPendingReviewItemId.value = ''
  }
}

async function dismissPendingReviewItem(item: ElectronPlastMemPendingReviewQueueItem) {
  if (mutatingPendingReviewItemId.value)
    return

  mutatingPendingReviewItemId.value = item.id
  pendingReviewError.value = ''
  try {
    const result = await invokeDismissPendingReviewQueueItem({
      itemId: item.id,
    })
    if (result.error) {
      pendingReviewError.value = result.error
      return
    }
    if (!result.consumed) {
      pendingReviewError.value = tn('review-queue.actions.dismiss-failed')
      return
    }

    if (editingPendingReviewItemId.value === item.id)
      resetPendingReviewEditor()
    pendingReviewItems.value = pendingReviewItems.value.filter(current => current.id !== item.id)
    await refreshHealth()
  }
  catch (error) {
    pendingReviewError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    mutatingPendingReviewItemId.value = ''
  }
}

async function retryFailedReviewJob(job: ElectronPlastMemFailedReviewJob) {
  if (mutatingFailedReviewJobId.value)
    return

  mutatingFailedReviewJobId.value = job.id
  pendingReviewError.value = ''
  try {
    const result = await invokeRetryFailedReviewJob({
      jobId: job.id,
    })
    if (result.error) {
      pendingReviewError.value = result.error
      return
    }
    if (!result.ok) {
      pendingReviewError.value = tn('review-jobs.retry-failed')
      await refreshFailedReviewJobs()
      return
    }

    failedReviewJobs.value = failedReviewJobs.value.filter(current => current.id !== job.id)
    await refreshHealth()
  }
  catch (error) {
    pendingReviewError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    mutatingFailedReviewJobId.value = ''
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
      if (editingSemanticMemoryId.value && !result.memories.some(memory => memory.id === editingSemanticMemoryId.value))
        resetSemanticMemoryEditor()
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
  activeDetailPanel.value = 'health'
  activeHealthInspector.value = memory.invalid_at ? 'semantic-memories' : 'active-semantic-memories'
  if (recentMemories.value.length < 100)
    await refreshRecentMemories()
}

function resetSemanticMemoryEditor() {
  editingSemanticMemoryId.value = ''
  semanticMemoryDraftCategory.value = ''
  semanticMemoryDraftFact.value = ''
}

function beginSemanticMemoryEdit(memory: ElectronPlastMemSemanticMemory) {
  if (mutatingSemanticMemoryId.value)
    return

  editingSemanticMemoryId.value = memory.id
  semanticMemoryDraftCategory.value = memory.category
  semanticMemoryDraftFact.value = memory.fact
  semanticMemoriesError.value = ''
}

async function saveSemanticMemoryEdit(memory: ElectronPlastMemSemanticMemory) {
  if (mutatingSemanticMemoryId.value)
    return

  const fact = semanticMemoryDraftFact.value.trim()
  const category = semanticMemoryDraftCategory.value.trim()
  if (!fact) {
    semanticMemoriesError.value = tn('semantic-memories.editor.fact-required')
    return
  }

  mutatingSemanticMemoryId.value = memory.id
  semanticMemoriesError.value = ''
  try {
    const result = await invokeUpdateSemanticMemory({
      category,
      fact,
      memoryId: memory.id,
    })
    if (result.error) {
      semanticMemoriesError.value = result.error
      return
    }

    resetSemanticMemoryEditor()
    await refreshSemanticMemories()
    await refreshHealth()
  }
  catch (error) {
    semanticMemoriesError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    mutatingSemanticMemoryId.value = ''
  }
}

async function deleteSemanticMemory(memory: ElectronPlastMemSemanticMemory) {
  if (mutatingSemanticMemoryId.value)
    return

  mutatingSemanticMemoryId.value = memory.id
  semanticMemoriesError.value = ''
  try {
    const result = await invokeDeleteSemanticMemory({
      memoryId: memory.id,
    })
    if (result.error) {
      semanticMemoriesError.value = result.error
      return
    }
    if (!result.deleted) {
      semanticMemoriesError.value = tn('semantic-memories.editor.delete-failed')
      return
    }

    if (editingSemanticMemoryId.value === memory.id)
      resetSemanticMemoryEditor()
    semanticMemories.value = semanticMemories.value.filter(item => item.id !== memory.id)
    await refreshHealth()
  }
  catch (error) {
    semanticMemoriesError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    mutatingSemanticMemoryId.value = ''
  }
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
  if (activeDetailPanel.value === 'health' && activeHealthInspector.value === 'semantic-memories')
    void refreshSemanticMemories()
})

watch(activeDetailPanel, (panel) => {
  if (panel !== 'health') {
    selectedSourceMemoryIds.value = []
    resetSemanticMemoryEditor()
    resetPendingReviewEditor()
    resetPendingReviewMemoryEditor()
  }

  if (panel === 'health') {
    void Promise.all([
      refreshHealth(),
      refreshPendingReviewItems(),
      refreshFailedReviewJobs(),
    ])
  }
  else if (panel === 'recent') {
    void refreshRecentMemories()
  }
  else if (panel === 'runtime') {
    void refreshStatus()
  }
})

watch(activeHealthInspector, (inspector) => {
  if (inspector !== 'conversation-messages')
    resetConversationMessageEditor()
  if (inspector !== 'episodic-memories')
    resetRecentMemoryEditor()
  if (inspector !== 'semantic-memories' && inspector !== 'active-semantic-memories') {
    selectedSourceMemoryIds.value = []
    resetSemanticMemoryEditor()
    return
  }

  if (inspector === 'active-semantic-memories' && includeInvalidSemanticMemories.value)
    includeInvalidSemanticMemories.value = false
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

onMounted(() => {
  void refreshConfig()
  void refreshStatus()
  void refreshSidecarStatus()
  void refreshHealth()
  void refreshPendingReviewItems()
  void refreshFailedReviewJobs()
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

      <MemoryLongTermConfigPanel
        v-if="activeDetailPanel === 'config'"
        v-model="configDraft"
        v-model:api-key-visible="apiKeyVisible"
        v-model:advanced-config-visible="advancedConfigVisible"
        :configured-by-user="status?.configuredByUser"
        :config-error="configError"
        :config-saved-message="configSavedMessage"
        :is-loading-config="isLoadingConfig"
        :is-refreshing="isRefreshing"
        :is-saving-config="isSavingConfig"
        :is-testing-connection="isTestingConnection"
        :review-window-options="reviewWindowOptions"
        @reload="refreshConfig"
        @save="saveConfig({ refreshAfterSave: true, showSavedMessage: true, syncDraft: 'always' })"
        @save-and-check="testConnection(true)"
      />

      <MemoryLongTermRuntimePanel
        v-else-if="activeDetailPanel === 'runtime'"
        :health="health"
        :is-checking-health="isCheckingHealth"
        :is-refreshing="isRefreshing"
        :is-refreshing-sidecar="isRefreshingSidecar"
        :is-restarting-sidecar="isRestartingSidecar"
        :is-saving-config="isSavingConfig"
        :is-starting-sidecar="isStartingSidecar"
        :is-stopping-sidecar="isStoppingSidecar"
        :status-error="statusError"
        :sidecar-status="sidecarStatus"
        :status="status"
        @refresh-health="refreshHealth(true)"
        @refresh-status="refreshStatus"
        @refresh-sidecar="refreshSidecarStatus"
        @restart-sidecar="restartSidecar"
        @start-sidecar="startSidecar"
        @stop-sidecar="stopSidecar"
      />

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
            @click="refreshHealth(true)"
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

        <div :class="['grid', 'grid-cols-1', 'gap-2', 'md:grid-cols-2']">
          <div :class="['min-w-0', 'flex', 'items-start', 'justify-between', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'px-3', 'py-2', 'dark:bg-neutral-950/30']">
            <div :class="['min-w-0', 'flex', 'items-start', 'gap-2']">
              <div :class="['i-solar:cpu-bold-duotone', 'mt-0.5', 'text-lg', 'text-neutral-500']" />
              <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
                <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('health.chat-model') }}</span>
                <span
                  v-if="health?.modelHealth?.chat.error"
                  :class="['whitespace-pre-wrap', 'break-words', 'font-mono', 'text-[11px]', 'text-red-600', 'leading-4', 'dark:text-red-300']"
                >
                  {{ formatProviderError(tn('health.chat-model'), health.modelHealth.chat.error) }}
                </span>
              </div>
            </div>
            <span :class="['shrink-0', 'rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium', healthChatModelBadgeClass]">
              {{ health?.modelHealth?.chat.ok ? tn('health.status.ok') : health?.modelHealth ? tn('health.status.error') : tn('health.status.unknown') }}
            </span>
          </div>

          <div :class="['min-w-0', 'flex', 'items-start', 'justify-between', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'px-3', 'py-2', 'dark:bg-neutral-950/30']">
            <div :class="['min-w-0', 'flex', 'items-start', 'gap-2']">
              <div :class="['i-solar:database-bold-duotone', 'mt-0.5', 'text-lg', 'text-neutral-500']" />
              <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
                <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('health.embedding-model') }}</span>
                <span
                  v-if="health?.modelHealth?.embedding.error"
                  :class="['whitespace-pre-wrap', 'break-words', 'font-mono', 'text-[11px]', 'text-red-600', 'leading-4', 'dark:text-red-300']"
                >
                  {{ formatProviderError(tn('health.embedding-model'), health.modelHealth.embedding.error) }}
                </span>
              </div>
            </div>
            <span :class="['shrink-0', 'rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium', healthEmbeddingModelBadgeClass]">
              {{ health?.modelHealth?.embedding.ok ? tn('health.status.ok') : health?.modelHealth ? tn('health.status.error') : tn('health.status.unknown') }}
            </span>
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
            :class="[
              'min-w-0',
              'flex',
              'cursor-pointer',
              'flex-col',
              'gap-1',
              'rounded-md',
              'bg-neutral-100/70',
              'p-3',
              'transition-colors',
              'hover:bg-neutral-200/70',
              'dark:bg-neutral-950/30',
              'dark:hover:bg-neutral-900/70',
              activeHealthInspector === item.key ? 'ring-1 ring-primary-400/60 dark:ring-primary-300/50' : '',
            ]"
            role="button"
            tabindex="0"
            @click="openHealthCountInspector(item.key as HealthInspectorId)"
          >
            <span :class="['text-[10px]', 'font-medium', 'uppercase', 'text-neutral-400', 'dark:text-neutral-500']">{{ tn(`health.counts.${item.key}`) }}</span>
            <span :class="['font-mono', 'text-lg', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">{{ formatCount(item.value) }}</span>
          </div>
        </div>

        <section
          v-if="activeHealthInspector"
          :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-950/30']"
        >
          <div :class="['flex', 'items-center', 'justify-between', 'gap-3']">
            <h4 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
              {{ tn(`health.counts.${activeHealthInspector}`) }}
            </h4>
            <Button
              variant="secondary"
              size="sm"
              icon="i-solar:close-circle-bold-duotone"
              :label="tn('health.inspector.close')"
              @click="activeHealthInspector = undefined"
            />
          </div>

          <Callout
            v-if="activeHealthInspector === 'conversation-messages' && conversationMessagesError"
            theme="orange"
            :label="tn('health.inspector.error')"
          >
            {{ conversationMessagesError }}
          </Callout>
          <div
            v-else-if="activeHealthInspector === 'conversation-messages' && isLoadingConversationMessages"
            :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']"
          >
            {{ tn('health.inspector.loading') }}
          </div>
          <div
            v-else-if="activeHealthInspector === 'conversation-messages' && conversationMessages.length === 0"
            :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']"
          >
            {{ tn('health.inspector.empty') }}
          </div>
          <div
            v-else-if="activeHealthInspector === 'conversation-messages'"
            :class="['flex', 'max-h-80', 'flex-col', 'gap-2', 'overflow-y-auto']"
          >
            <div
              v-for="message in conversationMessages"
              :key="message.seq"
              :class="['rounded-md', 'bg-white/70', 'p-2.5', 'dark:bg-neutral-900/70']"
            >
              <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                <span :class="['text-xs', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                  {{ message.speaker_name || message.role }}
                </span>
                <span :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                  #{{ message.seq }}
                </span>
              </div>
              <div v-if="editingConversationMessageSeq === message.seq" :class="['mt-2', 'flex', 'flex-col', 'gap-3']">
                <FieldInput
                  v-model="conversationMessageDraftRole"
                  :label="tn('health.inspector.message-role')"
                  :disabled="mutatingConversationMessageSeq === message.seq"
                />
                <FieldInput
                  v-model="conversationMessageDraftSpeakerName"
                  :label="tn('health.inspector.message-speaker')"
                  :disabled="mutatingConversationMessageSeq === message.seq"
                />
                <FieldInput
                  v-model="conversationMessageDraftTimestamp"
                  :label="tn('health.inspector.message-time')"
                  type="datetime-local"
                  :disabled="mutatingConversationMessageSeq === message.seq"
                />
                <Textarea
                  v-model="conversationMessageDraftContent"
                  :disabled="mutatingConversationMessageSeq === message.seq"
                  :class="['min-h-24', 'text-sm']"
                />
              </div>
              <p v-else :class="['mt-1', 'whitespace-pre-wrap', 'break-words', 'text-xs', 'text-neutral-600', 'leading-5', 'dark:text-neutral-300']">
                {{ message.content }}
              </p>
              <div :class="['mt-2', 'flex', 'flex-wrap', 'justify-end', 'gap-2']">
                <template v-if="editingConversationMessageSeq === message.seq">
                  <Button
                    variant="secondary"
                    size="sm"
                    :disabled="mutatingConversationMessageSeq === message.seq"
                    @click="resetConversationMessageEditor"
                  >
                    {{ tn('semantic-memories.actions.cancel') }}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    :loading="mutatingConversationMessageSeq === message.seq"
                    :disabled="mutatingConversationMessageSeq === message.seq"
                    @click="saveConversationMessageEdit(message)"
                  >
                    {{ tn('semantic-memories.actions.save') }}
                  </Button>
                </template>
                <Button
                  v-else
                  variant="secondary"
                  size="sm"
                  icon="i-solar:pen-2-bold-duotone"
                  :label="tn('semantic-memories.actions.edit')"
                  @click="beginConversationMessageEdit(message)"
                />
              </div>
            </div>
          </div>

          <Callout
            v-else-if="activeHealthInspector === 'episode-spans' && episodeSpansError"
            theme="orange"
            :label="tn('health.inspector.error')"
          >
            {{ episodeSpansError }}
          </Callout>
          <div
            v-else-if="activeHealthInspector === 'episode-spans' && isLoadingEpisodeSpans"
            :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']"
          >
            {{ tn('health.inspector.loading') }}
          </div>
          <div
            v-else-if="activeHealthInspector === 'episode-spans' && episodeSpans.length === 0"
            :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']"
          >
            {{ tn('health.inspector.empty') }}
          </div>
          <div
            v-else-if="activeHealthInspector === 'episode-spans'"
            :class="['flex', 'max-h-80', 'flex-col', 'gap-2', 'overflow-y-auto']"
          >
            <div
              v-for="span in episodeSpans"
              :key="`${span.start_seq}-${span.end_seq}`"
              :class="['rounded-md', 'bg-white/70', 'p-2.5', 'dark:bg-neutral-900/70']"
            >
              <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                <span :class="['text-xs', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                  {{ classificationLabel(span.classification) }}
                </span>
                <span :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                  {{ span.start_seq }} - {{ span.end_seq }}
                </span>
              </div>
              <p :class="['mt-1', 'text-[11px]', 'text-neutral-500', 'dark:text-neutral-400']">
                {{ formatMemoryTime(span.created_at) }}
              </p>
            </div>
          </div>

          <div
            v-else-if="activeHealthInspector === 'episodic-memories'"
            :class="['flex', 'flex-col', 'gap-2', 'max-h-80', 'overflow-y-auto']"
          >
            <div
              v-for="memory in recentMemories"
              :key="memory.id"
              :class="['rounded-md', 'bg-white/70', 'p-2.5', 'dark:bg-neutral-900/70']"
            >
              <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                <span :class="['text-xs', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                  {{ memory.title || tn('recent-memories.untitled') }}
                </span>
                <span :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                  {{ memory.id.slice(0, 8) }}
                </span>
              </div>
              <div v-if="editingRecentMemoryId === memory.id" :class="['mt-2', 'flex', 'flex-col', 'gap-3']">
                <FieldInput
                  v-model="recentMemoryDraftTitle"
                  :label="tn('health.inspector.memory-title')"
                  :disabled="mutatingRecentMemoryId === memory.id"
                />
                <Textarea
                  v-model="recentMemoryDraftContent"
                  :disabled="mutatingRecentMemoryId === memory.id"
                  :class="['min-h-24', 'text-sm']"
                />
              </div>
              <p v-else :class="['mt-1', 'line-clamp-3', 'text-xs', 'text-neutral-600', 'leading-5', 'dark:text-neutral-300']">
                {{ memory.content }}
              </p>
              <div :class="['mt-2', 'flex', 'flex-wrap', 'justify-end', 'gap-2']">
                <template v-if="editingRecentMemoryId === memory.id">
                  <Button
                    variant="secondary"
                    size="sm"
                    :disabled="mutatingRecentMemoryId === memory.id"
                    @click="resetRecentMemoryEditor"
                  >
                    {{ tn('semantic-memories.actions.cancel') }}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    :loading="mutatingRecentMemoryId === memory.id"
                    :disabled="mutatingRecentMemoryId === memory.id"
                    @click="saveRecentMemoryEdit(memory)"
                  >
                    {{ tn('semantic-memories.actions.save') }}
                  </Button>
                </template>
                <Button
                  v-else
                  variant="secondary"
                  size="sm"
                  icon="i-solar:pen-2-bold-duotone"
                  :label="tn('semantic-memories.actions.edit')"
                  @click="beginRecentMemoryEdit(memory)"
                />
              </div>
            </div>
          </div>

          <div
            v-else-if="activeHealthInspector === 'semantic-memories' || activeHealthInspector === 'active-semantic-memories'"
            :class="['flex', 'flex-col', 'gap-2', 'max-h-80', 'overflow-y-auto']"
          >
            <div
              v-for="memory in semanticMemories"
              :key="memory.id"
              :class="['rounded-md', 'bg-white/70', 'p-2.5', 'dark:bg-neutral-900/70']"
            >
              <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                <span :class="['text-xs', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                  {{ memory.category || tn('semantic-memories.uncategorized') }}
                </span>
                <div :class="['flex', 'items-center', 'gap-1.5']">
                  <span :class="['rounded-full', 'px-1.5', 'py-0.5', 'text-[10px]', 'font-medium', semanticMemoryStatusBadgeClass(memory)]">
                    {{ semanticMemoryStatusLabel(memory) }}
                  </span>
                  <span :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                    {{ memory.id.slice(0, 8) }}
                  </span>
                </div>
              </div>
              <div v-if="editingSemanticMemoryId === memory.id" :class="['mt-2', 'flex', 'flex-col', 'gap-3']">
                <FieldInput
                  v-model="semanticMemoryDraftCategory"
                  :label="tn('semantic-memories.editor.category')"
                  :placeholder="tn('semantic-memories.editor.category-placeholder')"
                  :disabled="mutatingSemanticMemoryId === memory.id"
                />
                <div :class="['flex', 'flex-col', 'gap-1.5']">
                  <span :class="['text-xs', 'font-medium', 'text-neutral-600', 'dark:text-neutral-300']">
                    {{ tn('semantic-memories.editor.fact') }}
                  </span>
                  <Textarea
                    v-model="semanticMemoryDraftFact"
                    :disabled="mutatingSemanticMemoryId === memory.id"
                    :placeholder="tn('semantic-memories.editor.fact-placeholder')"
                    :class="['min-h-28', 'text-sm']"
                  />
                </div>
              </div>
              <p v-else :class="['mt-1', 'line-clamp-3', 'text-xs', 'text-neutral-600', 'leading-5', 'dark:text-neutral-300']">
                {{ memory.fact }}
              </p>
              <div :class="['mt-1', 'flex', 'flex-wrap', 'gap-x-3', 'gap-y-1', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                <span>{{ tn('semantic-memories.created', { time: formatMemoryTime(memory.created_at) }) }}</span>
                <span>{{ tn('semantic-memories.valid-at', { time: formatMemoryTime(memory.valid_at) }) }}</span>
                <span v-if="memory.invalid_at">{{ tn('semantic-memories.invalid-at', { time: formatMemoryTime(memory.invalid_at) }) }}</span>
                <span>{{ tn('semantic-memories.sources', { count: memory.source_episodic_ids.length }) }}</span>
              </div>
              <div :class="['mt-2', 'flex', 'flex-wrap', 'justify-end', 'gap-2']">
                <template v-if="editingSemanticMemoryId === memory.id">
                  <Button
                    variant="secondary"
                    size="sm"
                    :disabled="Boolean(mutatingSemanticMemoryId)"
                    @click="resetSemanticMemoryEditor"
                  >
                    {{ tn('semantic-memories.actions.cancel') }}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    :loading="mutatingSemanticMemoryId === memory.id"
                    :disabled="Boolean(mutatingSemanticMemoryId)"
                    @click="saveSemanticMemoryEdit(memory)"
                  >
                    {{ tn('semantic-memories.actions.save') }}
                  </Button>
                </template>
                <template v-else>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="i-solar:link-round-angle-bold-duotone"
                    :disabled="memory.source_episodic_ids.length === 0 || Boolean(mutatingSemanticMemoryId)"
                    :label="tn('semantic-memories.actions.sources')"
                    @click="showSemanticMemorySources(memory)"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="i-solar:pen-2-bold-duotone"
                    :disabled="Boolean(mutatingSemanticMemoryId)"
                    :label="tn('semantic-memories.actions.edit')"
                    @click="beginSemanticMemoryEdit(memory)"
                  />
                  <Button
                    :variant="memory.invalid_at ? 'secondary' : 'caution'"
                    size="sm"
                    :loading="mutatingSemanticMemoryId === memory.id"
                    :disabled="Boolean(mutatingSemanticMemoryId)"
                    :icon="memory.invalid_at ? 'i-solar:restart-bold-duotone' : 'i-solar:trash-bin-minimalistic-bold-duotone'"
                    :label="memory.invalid_at ? tn('semantic-memories.actions.restore') : tn('semantic-memories.actions.invalidate')"
                    @click="setSemanticMemoryInvalid(memory, !memory.invalid_at)"
                  />
                  <DoubleCheckButton
                    variant="danger"
                    cancel-variant="secondary"
                    size="sm"
                    :disabled="Boolean(mutatingSemanticMemoryId)"
                    :loading="mutatingSemanticMemoryId === memory.id"
                    @confirm="deleteSemanticMemory(memory)"
                  >
                    {{ tn('semantic-memories.actions.delete') }}
                    <template #confirm>
                      {{ tn('semantic-memories.actions.confirm-delete') }}
                    </template>
                    <template #cancel>
                      {{ tn('semantic-memories.actions.cancel') }}
                    </template>
                  </DoubleCheckButton>
                </template>
              </div>
            </div>
          </div>

          <section
            v-if="selectedSourceMemoryIds.length > 0 && (activeHealthInspector === 'semantic-memories' || activeHealthInspector === 'active-semantic-memories')"
            :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'bg-white/50', 'p-3', 'dark:bg-neutral-900/40']"
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

          <div
            v-else-if="activeHealthInspector === 'pending-reviews'"
            :class="['flex', 'flex-col', 'gap-3']"
          >
            <Callout v-if="pendingReviewError" theme="orange" :label="tn('review-queue.error')">
              {{ pendingReviewError }}
            </Callout>

            <section :class="['flex', 'flex-col', 'gap-2']">
              <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                <span :class="['text-xs', 'font-semibold', 'text-amber-700', 'dark:text-amber-300']">
                  {{ tn('health.counts.due-pending-reviews') }}
                </span>
                <span :class="['rounded-full', 'bg-amber-500/15', 'px-2', 'py-0.5', 'text-[10px]', 'font-medium', 'text-amber-700', 'dark:text-amber-300']">
                  {{ formatCount(duePendingReviewCount) }}
                </span>
              </div>
              <div v-if="duePendingReviewItems.length === 0" :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                {{ tn('review-queue.empty-due') }}
              </div>
              <div
                v-else
                :class="['flex', 'flex-col', 'gap-3']"
              >
                <div
                  v-for="item in duePendingReviewItems"
                  :key="item.id"
                  :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'border', 'border-amber-300/40', 'bg-white/70', 'p-3', 'dark:border-amber-400/25', 'dark:bg-neutral-900/70']"
                >
                  <div :class="['flex', 'items-start', 'justify-between', 'gap-3']">
                    <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
                      <span :class="['text-[10px]', 'font-medium', 'uppercase', 'text-neutral-400', 'dark:text-neutral-500']">
                        {{ tn('review-queue.item.query-label') }}
                      </span>
                      <div v-if="editingPendingReviewItemId === item.id" :class="['flex', 'flex-col', 'gap-2']">
                        <Textarea
                          v-model="pendingReviewDraftQuery"
                          :disabled="mutatingPendingReviewItemId === item.id"
                          :placeholder="tn('review-queue.editor.query-placeholder')"
                          :class="['min-h-24', 'text-sm']"
                        />
                      </div>
                      <p v-else :class="['whitespace-pre-wrap', 'break-words', 'text-sm', 'text-neutral-700', 'leading-5', 'dark:text-neutral-200']">
                        {{ item.query }}
                      </p>
                    </div>
                    <span :class="['shrink-0', 'font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                      {{ item.id.slice(0, 8) }}
                    </span>
                  </div>

                  <div :class="['flex', 'flex-wrap', 'gap-x-3', 'gap-y-1', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                    <span>{{ tn('review-queue.item.created', { time: formatMemoryTime(item.created_at) }) }}</span>
                    <span>{{ tn('review-queue.item.memories', { count: item.memories.length }) }}</span>
                    <span>{{ tn('review-queue.item.due-count', { count: item.due_memory_count }) }}</span>
                  </div>

                  <Collapsible :default="false">
                    <template #trigger="slotProps">
                      <button
                        :class="['w-full', 'flex', 'items-center', 'justify-between', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'px-3', 'py-2', 'text-left', 'dark:bg-neutral-950/40']"
                        @click="slotProps.setVisible(!slotProps.visible)"
                      >
                        <div :class="['min-w-0', 'flex', 'flex-col', 'gap-0.5']">
                          <span :class="['text-[10px]', 'font-medium', 'uppercase', 'text-neutral-400', 'dark:text-neutral-500']">
                            {{ tn('review-queue.item.linked-title') }}
                          </span>
                          <span :class="['text-xs', 'text-neutral-600', 'dark:text-neutral-300']">
                            {{ tn('review-queue.item.memories', { count: item.memories.length }) }}
                          </span>
                        </div>
                        <div :class="['flex', 'items-center', 'gap-2']">
                          <span :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                            {{ formatCount(item.memories.length) }}
                          </span>
                          <div
                            :class="[
                              'i-solar:alt-arrow-down-linear',
                              'text-base',
                              'text-neutral-400',
                              'transition-transform',
                              'duration-250',
                              'dark:text-neutral-500',
                              slotProps.visible ? 'rotate-180' : 'rotate-0',
                            ]"
                          />
                        </div>
                      </button>
                    </template>

                    <div :class="['mt-2', 'grid', 'grid-cols-1', 'gap-2', 'xl:grid-cols-2']">
                      <div
                        v-for="memory in item.memories"
                        :key="memory.id"
                        :class="['min-w-0', 'flex', 'flex-col', 'gap-1.5', 'rounded-md', 'bg-neutral-100/70', 'p-2.5', 'dark:bg-neutral-950/40']"
                      >
                        <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                          <span :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                            {{ memory.id.slice(0, 8) }}
                          </span>
                          <span :class="['text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                            {{ tn('review-queue.item.memory-reviewed', { time: formatMemoryTime(memory.last_reviewed_at) }) }}
                          </span>
                        </div>
                        <FieldInput
                          v-if="editingPendingReviewMemoryKey === pendingReviewMemoryEditorKey(item.id, memory.id)"
                          v-model="pendingReviewMemoryDraftTitle"
                          :disabled="mutatingPendingReviewItemId === item.id"
                          :placeholder="tn('review-queue.memory-editor.title-placeholder')"
                        />
                        <Textarea
                          v-if="editingPendingReviewMemoryKey === pendingReviewMemoryEditorKey(item.id, memory.id)"
                          v-model="pendingReviewMemoryDraftContent"
                          :disabled="mutatingPendingReviewItemId === item.id"
                          :placeholder="tn('review-queue.memory-editor.content-placeholder')"
                          :class="['min-h-24', 'text-sm']"
                        />
                        <p v-else :class="['whitespace-pre-wrap', 'break-words', 'text-[11px]', 'text-neutral-600', 'leading-5', 'dark:text-neutral-300']">
                          {{ memory.content }}
                        </p>
                        <div :class="['flex', 'flex-wrap', 'gap-x-3', 'gap-y-1', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                          <span>{{ tn('review-queue.item.memory-created', { time: formatMemoryTime(memory.created_at) }) }}</span>
                        </div>
                        <div :class="['flex', 'flex-wrap', 'justify-end', 'gap-2']">
                          <template v-if="editingPendingReviewMemoryKey === pendingReviewMemoryEditorKey(item.id, memory.id)">
                            <Button
                              variant="secondary"
                              size="sm"
                              :disabled="Boolean(mutatingPendingReviewItemId)"
                              @click="resetPendingReviewMemoryEditor"
                            >
                              {{ tn('review-queue.actions.cancel') }}
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              :loading="mutatingPendingReviewItemId === item.id"
                              :disabled="Boolean(mutatingPendingReviewItemId)"
                              @click="savePendingReviewMemoryEdit(item, memory)"
                            >
                              {{ tn('review-queue.actions.save') }}
                            </Button>
                          </template>
                          <Button
                            v-else
                            variant="secondary"
                            size="sm"
                            icon="i-solar:pen-2-bold-duotone"
                            :disabled="Boolean(mutatingPendingReviewItemId)"
                            :label="tn('review-queue.actions.edit-memory')"
                            @click="beginPendingReviewMemoryEdit(item, memory)"
                          />
                        </div>
                      </div>
                    </div>
                  </Collapsible>

                  <div :class="['flex', 'flex-wrap', 'justify-end', 'gap-2']">
                    <template v-if="editingPendingReviewItemId === item.id">
                      <Button
                        variant="secondary"
                        size="sm"
                        :disabled="Boolean(mutatingPendingReviewItemId)"
                        @click="resetPendingReviewEditor"
                      >
                        {{ tn('review-queue.actions.cancel') }}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        :loading="mutatingPendingReviewItemId === item.id"
                        :disabled="Boolean(mutatingPendingReviewItemId)"
                        @click="savePendingReviewRewrite(item)"
                      >
                        {{ tn('review-queue.actions.save') }}
                      </Button>
                    </template>
                    <template v-else>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="i-solar:pen-2-bold-duotone"
                        :disabled="Boolean(mutatingPendingReviewItemId)"
                        :label="tn('review-queue.actions.rewrite')"
                        @click="beginPendingReviewEdit(item)"
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        :loading="mutatingPendingReviewItemId === item.id"
                        :disabled="Boolean(mutatingPendingReviewItemId)"
                        :label="tn('review-queue.actions.approve')"
                        @click="approvePendingReviewItem(item)"
                      />
                      <DoubleCheckButton
                        variant="secondary"
                        cancel-variant="secondary"
                        size="sm"
                        :disabled="Boolean(mutatingPendingReviewItemId)"
                        :loading="mutatingPendingReviewItemId === item.id"
                        @confirm="dismissPendingReviewItem(item)"
                      >
                        {{ tn('review-queue.actions.dismiss') }}
                        <template #confirm>
                          {{ tn('review-queue.actions.confirm-dismiss') }}
                        </template>
                        <template #cancel>
                          {{ tn('review-queue.actions.cancel') }}
                        </template>
                      </DoubleCheckButton>
                    </template>
                  </div>
                </div>
              </div>
            </section>

            <section :class="['flex', 'flex-col', 'gap-2']">
              <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                <span :class="['text-xs', 'font-semibold', 'text-sky-700', 'dark:text-sky-300']">
                  {{ tn('health.counts.deferred-pending-reviews') }}
                </span>
                <span :class="['rounded-full', 'bg-sky-500/15', 'px-2', 'py-0.5', 'text-[10px]', 'font-medium', 'text-sky-700', 'dark:text-sky-300']">
                  {{ formatCount(deferredPendingReviewCount) }}
                </span>
              </div>
              <div v-if="deferredPendingReviewItems.length > 0" :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                <span :class="['font-medium']">{{ tn('review-queue.deferred-title') }}</span>
                {{ ` ` }}{{ tn('review-queue.deferred-description') }}
              </div>
              <div v-else :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                {{ tn('review-queue.empty-deferred') }}
              </div>
              <div
                v-if="deferredPendingReviewItems.length > 0"
                :class="['flex', 'flex-col', 'gap-3']"
              >
                <div
                  v-for="item in deferredPendingReviewItems"
                  :key="item.id"
                  :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'border', 'border-sky-300/40', 'bg-white/70', 'p-3', 'dark:border-sky-400/25', 'dark:bg-neutral-900/70']"
                >
                  <div :class="['flex', 'items-start', 'justify-between', 'gap-3']">
                    <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
                      <span :class="['text-[10px]', 'font-medium', 'uppercase', 'text-neutral-400', 'dark:text-neutral-500']">
                        {{ tn('review-queue.item.query-label') }}
                      </span>
                      <p :class="['whitespace-pre-wrap', 'break-words', 'text-sm', 'text-neutral-700', 'leading-5', 'dark:text-neutral-200']">
                        {{ item.query }}
                      </p>
                    </div>
                    <span :class="['shrink-0', 'font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                      {{ item.id.slice(0, 8) }}
                    </span>
                  </div>

                  <div :class="['flex', 'flex-wrap', 'gap-x-3', 'gap-y-1', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                    <span>{{ tn('review-queue.item.created', { time: formatMemoryTime(item.created_at) }) }}</span>
                    <span>{{ tn('review-queue.item.memories', { count: item.memories.length }) }}</span>
                    <span>{{ tn('review-queue.item.deferred-count', { count: item.deferred_memory_count }) }}</span>
                  </div>

                  <Collapsible :default="false">
                    <template #trigger="slotProps">
                      <button
                        :class="['w-full', 'flex', 'items-center', 'justify-between', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'px-3', 'py-2', 'text-left', 'dark:bg-neutral-950/40']"
                        @click="slotProps.setVisible(!slotProps.visible)"
                      >
                        <div :class="['min-w-0', 'flex', 'flex-col', 'gap-0.5']">
                          <span :class="['text-[10px]', 'font-medium', 'uppercase', 'text-neutral-400', 'dark:text-neutral-500']">
                            {{ tn('review-queue.item.linked-title') }}
                          </span>
                          <span :class="['text-xs', 'text-neutral-600', 'dark:text-neutral-300']">
                            {{ tn('review-queue.item.memories', { count: item.memories.length }) }}
                          </span>
                        </div>
                        <div :class="['flex', 'items-center', 'gap-2']">
                          <span :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                            {{ formatCount(item.memories.length) }}
                          </span>
                          <div
                            :class="[
                              'i-solar:alt-arrow-down-linear',
                              'text-base',
                              'text-neutral-400',
                              'transition-transform',
                              'duration-250',
                              'dark:text-neutral-500',
                              slotProps.visible ? 'rotate-180' : 'rotate-0',
                            ]"
                          />
                        </div>
                      </button>
                    </template>

                    <div :class="['mt-2', 'grid', 'grid-cols-1', 'gap-2', 'xl:grid-cols-2']">
                      <div
                        v-for="memory in item.memories"
                        :key="memory.id"
                        :class="['min-w-0', 'flex', 'flex-col', 'gap-1.5', 'rounded-md', 'bg-neutral-100/70', 'p-2.5', 'dark:bg-neutral-950/40']"
                      >
                        <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                          <span :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                            {{ memory.id.slice(0, 8) }}
                          </span>
                          <span :class="['text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                            {{ tn('review-queue.item.memory-reviewed', { time: formatMemoryTime(memory.last_reviewed_at) }) }}
                          </span>
                        </div>
                        <FieldInput
                          v-if="editingPendingReviewMemoryKey === pendingReviewMemoryEditorKey(item.id, memory.id)"
                          v-model="pendingReviewMemoryDraftTitle"
                          :disabled="mutatingPendingReviewItemId === item.id"
                          :placeholder="tn('review-queue.memory-editor.title-placeholder')"
                        />
                        <Textarea
                          v-if="editingPendingReviewMemoryKey === pendingReviewMemoryEditorKey(item.id, memory.id)"
                          v-model="pendingReviewMemoryDraftContent"
                          :disabled="mutatingPendingReviewItemId === item.id"
                          :placeholder="tn('review-queue.memory-editor.content-placeholder')"
                          :class="['min-h-24', 'text-sm']"
                        />
                        <p v-else :class="['whitespace-pre-wrap', 'break-words', 'text-[11px]', 'text-neutral-600', 'leading-5', 'dark:text-neutral-300']">
                          {{ memory.content }}
                        </p>
                        <div :class="['flex', 'flex-wrap', 'gap-x-3', 'gap-y-1', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                          <span>{{ tn('review-queue.item.memory-created', { time: formatMemoryTime(memory.created_at) }) }}</span>
                        </div>
                        <div :class="['flex', 'flex-wrap', 'justify-end', 'gap-2']">
                          <template v-if="editingPendingReviewMemoryKey === pendingReviewMemoryEditorKey(item.id, memory.id)">
                            <Button
                              variant="secondary"
                              size="sm"
                              :disabled="Boolean(mutatingPendingReviewItemId)"
                              @click="resetPendingReviewMemoryEditor"
                            >
                              {{ tn('review-queue.actions.cancel') }}
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              :loading="mutatingPendingReviewItemId === item.id"
                              :disabled="Boolean(mutatingPendingReviewItemId)"
                              @click="savePendingReviewMemoryEdit(item, memory)"
                            >
                              {{ tn('review-queue.actions.save') }}
                            </Button>
                          </template>
                          <Button
                            v-else
                            variant="secondary"
                            size="sm"
                            icon="i-solar:pen-2-bold-duotone"
                            :disabled="Boolean(mutatingPendingReviewItemId)"
                            :label="tn('review-queue.actions.edit-memory')"
                            @click="beginPendingReviewMemoryEdit(item, memory)"
                          />
                        </div>
                      </div>
                    </div>
                  </Collapsible>

                  <div :class="['flex', 'flex-wrap', 'justify-end', 'gap-2']">
                    <template v-if="editingPendingReviewItemId === item.id">
                      <Button
                        variant="secondary"
                        size="sm"
                        :disabled="Boolean(mutatingPendingReviewItemId)"
                        @click="resetPendingReviewEditor"
                      >
                        {{ tn('review-queue.actions.cancel') }}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        :loading="mutatingPendingReviewItemId === item.id"
                        :disabled="Boolean(mutatingPendingReviewItemId)"
                        @click="savePendingReviewRewrite(item)"
                      >
                        {{ tn('review-queue.actions.save') }}
                      </Button>
                    </template>
                    <Button
                      v-else
                      variant="secondary"
                      size="sm"
                      icon="i-solar:pen-2-bold-duotone"
                      :disabled="Boolean(mutatingPendingReviewItemId)"
                      :label="tn('review-queue.actions.rewrite')"
                      @click="beginPendingReviewEdit(item)"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section :class="['flex', 'flex-col', 'gap-2']">
              <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                <div :class="['flex', 'items-center', 'gap-2']">
                  <span :class="['text-xs', 'font-semibold', 'text-rose-700', 'dark:text-rose-300']">
                    {{ tn('review-jobs.title') }}
                  </span>
                  <span
                    v-if="isLoadingFailedReviewJobs"
                    :class="['text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']"
                  >
                    {{ tn('review-jobs.loading') }}
                  </span>
                </div>
                <span :class="['rounded-full', 'bg-rose-500/15', 'px-2', 'py-0.5', 'text-[10px]', 'font-medium', 'text-rose-700', 'dark:text-rose-300']">
                  {{ tn('review-jobs.count', { count: failedReviewJobCount }) }}
                </span>
              </div>
              <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                {{ tn('review-jobs.description') }}
              </p>
              <div v-if="failedReviewJobs.length === 0" :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                {{ tn('review-jobs.empty') }}
              </div>
              <div v-else :class="['flex', 'flex-col', 'gap-2']">
                <div
                  v-for="job in failedReviewJobs"
                  :key="job.id"
                  :class="['rounded-md', 'border', 'border-rose-300/35', 'bg-rose-50/60', 'dark:border-rose-400/20', 'dark:bg-rose-950/12']"
                >
                  <Collapsible :default="false">
                    <template #trigger="slotProps">
                      <div :class="['flex', 'items-center', 'justify-between', 'gap-3', 'px-3', 'py-2']">
                        <button
                          :class="['min-w-0', 'flex', 'flex-1', 'items-center', 'gap-2', 'text-left']"
                          @click="slotProps.setVisible(!slotProps.visible)"
                        >
                          <div
                            :class="[
                              'i-solar:alt-arrow-down-linear',
                              'shrink-0',
                              'text-base',
                              'text-neutral-400',
                              'transition-transform',
                              'duration-250',
                              'dark:text-neutral-500',
                              slotProps.visible ? 'rotate-180' : 'rotate-0',
                            ]"
                          />
                          <div :class="['min-w-0', 'flex', 'flex-col', 'gap-0.5']">
                            <span :class="['truncate', 'text-xs', 'font-semibold', 'text-neutral-800', 'dark:text-neutral-100']">
                              {{ job.review.title }}
                            </span>
                            <div :class="['flex', 'flex-wrap', 'gap-x-2', 'gap-y-0.5', 'text-[10px]', 'text-neutral-500', 'dark:text-neutral-400']">
                              <span>{{ tn('review-jobs.attempts', { attempts: job.attempts, max: job.max_attempts }) }}</span>
                              <span>{{ tn('review-jobs.failed-at', { time: formatMemoryTime(job.done_at ?? job.run_at) }) }}</span>
                              <span>{{ tn('review-jobs.review-summary', { queries: job.review.pending_reviews.length, memories: failedReviewTotalMemoryCount(job) }) }}</span>
                            </div>
                          </div>
                        </button>
                        <div :class="['flex', 'shrink-0', 'items-center', 'gap-2']">
                          <Collapsible :default="false">
                            <template #trigger="errorSlotProps">
                              <button
                                :class="['i-solar:danger-circle-bold-duotone', 'text-lg', 'text-rose-600', 'transition', 'hover:scale-105', 'dark:text-rose-300']"
                                :aria-label="errorSlotProps.visible ? tn('review-jobs.hide-error') : tn('review-jobs.show-error')"
                                @click.stop="errorSlotProps.setVisible(!errorSlotProps.visible)"
                              />
                            </template>
                            <div :class="['absolute', 'right-16', 'z-20', 'mt-2', 'max-h-48', 'w-[min(28rem,calc(100vw-4rem))]', 'overflow-auto', 'rounded-md', 'border', 'border-rose-300/50', 'bg-white', 'p-3', 'shadow-lg', 'dark:border-rose-400/30', 'dark:bg-neutral-950']">
                              <p :class="['whitespace-pre-wrap', 'break-words', 'text-[11px]', 'text-rose-800', 'leading-5', 'dark:text-rose-200']">
                                {{ job.error }}
                              </p>
                            </div>
                          </Collapsible>
                          <span :class="['rounded-full', 'bg-rose-500/15', 'px-2', 'py-0.5', 'text-[10px]', 'font-semibold', 'uppercase', 'text-rose-700', 'dark:text-rose-300']">
                            {{ job.status }}
                          </span>
                          <Button
                            variant="primary"
                            size="sm"
                            icon="i-solar:restart-bold-duotone"
                            :loading="mutatingFailedReviewJobId === job.id"
                            :disabled="Boolean(mutatingFailedReviewJobId)"
                            :label="tn('review-jobs.retry')"
                            @click.stop="retryFailedReviewJob(job)"
                          />
                        </div>
                      </div>
                    </template>

                    <div :class="['border-t', 'border-rose-200/60', 'px-3', 'py-2.5', 'dark:border-rose-400/15']">
                      <div :class="['mb-2', 'flex', 'flex-wrap', 'gap-x-3', 'gap-y-1', 'text-[10px]', 'text-neutral-500', 'dark:text-neutral-400']">
                        <span :class="['shrink-0', 'font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                          {{ job.id.slice(0, 12) }}
                        </span>
                        <span>{{ tn('review-jobs.reviewed-at', { time: formatMemoryTime(job.review.reviewed_at) }) }}</span>
                      </div>
                      <div :class="['grid', 'grid-cols-1', 'gap-2']">
                        <div :class="['flex', 'flex-col', 'gap-1.5', 'rounded-md', 'bg-white/45', 'p-2', 'dark:bg-neutral-950/25']">
                          <div :class="['flex', 'flex-wrap', 'gap-1.5']">
                            <span
                              v-for="(review, reviewIndex) in failedReviewVisibleReviews(job)"
                              :key="`${job.id}:review:${reviewIndex}`"
                              :class="['max-w-full', 'rounded-full', 'bg-white/80', 'px-2', 'py-1', 'text-[11px]', 'text-neutral-700', 'shadow-sm', 'dark:bg-neutral-900/80', 'dark:text-neutral-200']"
                            >
                              {{ review.query }}
                            </span>
                            <button
                              v-if="failedReviewHiddenReviewCount(job) > 0"
                              :class="['rounded-full', 'bg-neutral-200/70', 'px-2', 'py-1', 'text-[11px]', 'text-neutral-500', 'transition', 'hover:bg-neutral-300/80', 'hover:text-neutral-700', 'dark:bg-neutral-800/70', 'dark:text-neutral-400', 'dark:hover:bg-neutral-700/80', 'dark:hover:text-neutral-200']"
                              @click="toggleFailedReviewQueries(job)"
                            >
                              {{ tn('review-jobs.more-queries', { count: failedReviewHiddenReviewCount(job) }) }}
                            </button>
                            <button
                              v-else-if="job.review.pending_reviews.length > failedReviewPreviewLimit"
                              :class="['rounded-full', 'bg-neutral-200/70', 'px-2', 'py-1', 'text-[11px]', 'text-neutral-500', 'transition', 'hover:bg-neutral-300/80', 'hover:text-neutral-700', 'dark:bg-neutral-800/70', 'dark:text-neutral-400', 'dark:hover:bg-neutral-700/80', 'dark:hover:text-neutral-200']"
                              @click="toggleFailedReviewQueries(job)"
                            >
                              {{ tn('review-jobs.collapse-queries') }}
                            </button>
                          </div>
                        </div>
                        <div :class="['flex', 'flex-col', 'gap-1.5']">
                          <span :class="['text-[10px]', 'font-medium', 'uppercase', 'text-neutral-400', 'dark:text-neutral-500']">
                            {{ tn('review-jobs.context-messages') }}
                          </span>
                          <div
                            v-for="(message, messageIndex) in job.review.context_messages"
                            :key="`${job.id}:message:${messageIndex}`"
                            :class="['rounded-md', 'bg-white/65', 'p-2', 'dark:bg-neutral-950/35']"
                          >
                            <span :class="['text-[10px]', 'font-semibold', 'text-neutral-500', 'dark:text-neutral-400']">
                              {{ message.speaker }}
                            </span>
                            <p :class="['mt-0.5', 'text-xs', 'text-neutral-700', 'leading-5', 'dark:text-neutral-200']">
                              {{ message.content }}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Collapsible>
                </div>
              </div>
            </section>
          </div>
        </section>

        <Callout v-if="healthError" theme="orange" :label="tn('health.error')">
          {{ healthError }}
        </Callout>
        <Callout v-else-if="modelHealthError" theme="orange" :label="tn('health.model-error')">
          <span :class="['whitespace-pre-wrap']">{{ modelHealthError }}</span>
        </Callout>
      </section>

      <MemoryLongTermDiagnosticsPanel
        v-else-if="activeDetailPanel === 'diagnostics'"
        :status="status"
      />

      <MemoryLongTermToolsPanel
        v-else-if="activeDetailPanel === 'tools'"
        v-model:manual-import-message-limit="manualImportMessageLimit"
        v-model:preview-query="previewQuery"
        :importable-chat-messages="importableChatMessages"
        :is-manual-importing="isManualImporting"
        :is-previewing-recall="isPreviewingRecall"
        :manual-import-error="manualImportError"
        :manual-import-message="manualImportMessage"
        :preview-error="previewError"
        :preview-result="previewResult"
        @import="importRecentChatMessages"
        @preview="previewMemoryRecall"
      />

      <MemoryLongTermRecentPanel
        v-else-if="activeDetailPanel === 'recent'"
        :is-loading-recent-memories="isLoadingRecentMemories"
        :recent-memories="recentMemories"
        :recent-memories-error="recentMemoriesError"
        @refresh="refreshRecentMemories"
      />

      <MemoryLongTermAboutPanel
        v-else-if="activeDetailPanel === 'about'"
      />
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
