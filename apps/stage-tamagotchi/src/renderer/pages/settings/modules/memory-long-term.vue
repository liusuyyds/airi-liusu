<script setup lang="ts">
import type {
  ElectronPlastMemConfig,
  ElectronPlastMemRuntimeStatus,
} from '../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { Button, Callout, FieldCheckbox, FieldInput, Input } from '@proj-airi/ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  defaultElectronPlastMemConfig,
  electronPlastMemApplyConfig,
  electronPlastMemGetConfig,
  electronPlastMemGetRuntimeStatus,
} from '../../../../shared/eventa'

type BridgeStatusKind = 'checking' | 'disabled' | 'offline' | 'online'

const { t } = useI18n()
const tn = (key: string, params?: Record<string, unknown>) => t(`settings.pages.modules.memory-long-term.sections.plast-mem-bridge.${key}`, params ?? {})

const invokeGetPlastMemConfig = useElectronEventaInvoke(electronPlastMemGetConfig)
const invokeApplyPlastMemConfig = useElectronEventaInvoke(electronPlastMemApplyConfig)
const invokeGetPlastMemRuntimeStatus = useElectronEventaInvoke(electronPlastMemGetRuntimeStatus)

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
const apiKeyVisible = ref(false)
const status = ref<ElectronPlastMemRuntimeStatus>()
const statusError = ref('')
const isRefreshing = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | undefined

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
const apiKeyInputType = computed(() => apiKeyVisible.value ? 'text' : 'password')
const recallStatusBadgeClass = computed(() => chatAttemptBadgeClass(recallDiagnostics.value.status))
const ingestStatusBadgeClass = computed(() => chatAttemptBadgeClass(ingestDiagnostics.value.status))
const recallStatusLabel = computed(() => tn(`chat-diagnostics.recall.status.${recallDiagnostics.value.status}`))
const ingestStatusLabel = computed(() => tn(`chat-diagnostics.ingest.status.${ingestDiagnostics.value.status}`))
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

function formatAttemptTime(value: number | undefined) {
  if (!value)
    return tn('chat-diagnostics.never')

  return new Date(value).toLocaleTimeString()
}

async function refreshConfig() {
  if (isLoadingConfig.value)
    return

  isLoadingConfig.value = true
  configError.value = ''
  try {
    configDraft.value = await invokeGetPlastMemConfig()
  }
  catch (error) {
    configError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    isLoadingConfig.value = false
  }
}

async function saveConfig(refreshAfterSave: boolean) {
  if (isSavingConfig.value)
    return

  isSavingConfig.value = true
  configError.value = ''
  configSavedMessage.value = ''
  try {
    configDraft.value = await invokeApplyPlastMemConfig({ ...configDraft.value })
    configSavedMessage.value = tn('config.saved')
    if (refreshAfterSave)
      await refreshStatus()
  }
  catch (error) {
    configError.value = errorMessageFrom(error) ?? 'Unknown error'
  }
  finally {
    isSavingConfig.value = false
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

onMounted(() => {
  void refreshConfig()
  void refreshStatus()
  refreshTimer = setInterval(() => {
    void refreshStatus()
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

        <Callout theme="primary" :label="tn('config.notice.title')">
          {{ tn('config.notice.description') }}
        </Callout>

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
            v-model="configDraft.databaseUrl"
            :label="tn('config.fields.database-url.label')"
            :description="tn('config.fields.database-url.description')"
            placeholder="postgres://plastmem:plastmem@localhost:5433/plastmem"
          />
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
          <FieldInput
            v-model="configDraft.requestTimeoutMsec"
            type="number"
            :label="tn('config.fields.request-timeout-msec.label')"
            :description="tn('config.fields.request-timeout-msec.description')"
            placeholder="10000"
          />
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
            @click="saveConfig(false)"
          />
          <Button
            size="sm" :loading="isSavingConfig || isRefreshing"
            icon="i-solar:plug-circle-bold-duotone" :label="tn('config.save-and-check')"
            @click="saveConfig(true)"
          />
        </div>
      </section>

      <section
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

        <div :class="['grid', 'grid-cols-1', 'gap-2', 'md:grid-cols-2']">
          <div :class="['min-w-0', 'flex', 'items-center', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'px-3', 'py-2', 'dark:bg-neutral-950/30']">
            <div :class="['i-solar:server-square-bold-duotone', 'text-lg', 'text-neutral-500']" />
            <div :class="['min-w-0', 'flex', 'flex-col', 'gap-0.5']">
              <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('runtime.service-url') }}</span>
              <span :class="['truncate', 'font-mono', 'text-xs', 'text-neutral-700', 'dark:text-neutral-200']">{{ status?.baseUrl ?? '-' }}</span>
            </div>
          </div>

          <div :class="['min-w-0', 'flex', 'items-center', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'px-3', 'py-2', 'dark:bg-neutral-950/30']">
            <div :class="['i-solar:plug-circle-bold-duotone', 'text-lg', 'text-neutral-500']" />
            <div :class="['min-w-0', 'flex', 'flex-col', 'gap-1']">
              <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('runtime.mcp-server') }}</span>
              <span :class="['w-fit', 'rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium', mcpServerBadgeClass]">{{ mcpServerLabel }}</span>
            </div>
          </div>

          <div :class="['min-w-0', 'flex', 'items-center', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'px-3', 'py-2', 'dark:bg-neutral-950/30']">
            <div :class="['i-solar:key-minimalistic-bold-duotone', 'text-lg', 'text-neutral-500']" />
            <div :class="['min-w-0', 'flex', 'flex-col', 'gap-0.5']">
              <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('runtime.conversation') }}</span>
              <span :class="['text-xs', 'font-medium', 'text-neutral-700', 'dark:text-neutral-200']">
                {{ status?.conversationIdConfigured ? tn('runtime.configured') : tn('runtime.missing') }}
              </span>
            </div>
          </div>

          <div :class="['min-w-0', 'flex', 'items-center', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'px-3', 'py-2', 'dark:bg-neutral-950/30']">
            <div :class="['i-solar:folder-with-files-bold-duotone', 'text-lg', 'text-neutral-500']" />
            <div :class="['min-w-0', 'flex', 'flex-col', 'gap-0.5']">
              <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('runtime.workspace') }}</span>
              <span :class="['truncate', 'font-mono', 'text-xs', 'text-neutral-700', 'dark:text-neutral-200']">{{ status?.workspaceKey ?? '-' }}</span>
            </div>
          </div>

          <div :class="['min-w-0', 'flex', 'items-center', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'px-3', 'py-2', 'dark:bg-neutral-950/30']">
            <div :class="['i-solar:database-bold-duotone', 'text-lg', 'text-neutral-500']" />
            <div :class="['min-w-0', 'flex', 'flex-col', 'gap-0.5']">
              <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('runtime.database') }}</span>
              <span :class="['text-xs', 'font-medium', 'text-neutral-700', 'dark:text-neutral-200']">
                {{ status?.databaseUrlConfigured ? tn('runtime.configured') : tn('runtime.missing') }}
              </span>
            </div>
          </div>

          <div :class="['min-w-0', 'flex', 'items-center', 'gap-3', 'rounded-md', 'bg-neutral-100/70', 'px-3', 'py-2', 'dark:bg-neutral-950/30']">
            <div :class="['i-solar:cpu-bolt-bold-duotone', 'text-lg', 'text-neutral-500']" />
            <div :class="['min-w-0', 'flex', 'flex-col', 'gap-0.5']">
              <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('runtime.model') }}</span>
              <span :class="['truncate', 'font-mono', 'text-xs', 'text-neutral-700', 'dark:text-neutral-200']">
                {{ status?.openaiChatModel || status?.openaiEmbeddingModel || '-' }}
              </span>
            </div>
          </div>
        </div>

        <Callout v-if="statusError" theme="orange" :label="tn('runtime.status-error')">
          {{ statusError }}
        </Callout>
        <Callout v-else-if="status?.error" theme="orange" :label="tn('runtime.service-error')">
          {{ status.error }}
        </Callout>
        <Callout v-else-if="status?.enabled && !status.conversationIdConfigured" theme="orange" :label="tn('runtime.conversation-missing-title')">
          {{ tn('runtime.conversation-missing') }}
        </Callout>

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
      </section>

      <Callout theme="primary">
        <template #label>
          <div :class="['flex', 'items-center', 'gap-2']">
            <div :class="['i-solar:chat-round-dots-bold-duotone', 'text-lg']" />
            <span>{{ t('settings.pages.modules.memory-long-term.sections.plast-mem-bridge.scope.title') }}</span>
          </div>
        </template>
        <p :class="['text-sm', 'text-neutral-700', 'leading-6', 'dark:text-neutral-300']">
          {{ t('settings.pages.modules.memory-long-term.sections.plast-mem-bridge.scope.description') }}
        </p>
      </Callout>

      <div :class="['grid', 'grid-cols-1', 'gap-3', 'lg:grid-cols-3']">
        <div
          v-for="fact in bridgeFacts"
          :key="fact.titleKey"
          :class="[
            'flex',
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
