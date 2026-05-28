<script setup lang="ts">
import type { ElectronPlastMemHealthResult, ElectronPlastMemRuntimeStatus, ElectronPlastMemSidecarStatus } from '../../../../../shared/eventa'

import { Button, Callout } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

type ConnectionCheckKind = 'error' | 'ok' | 'unknown'
type BridgeStatusKind = 'checking' | 'disabled' | 'offline' | 'online'

const props = defineProps<{
  health?: ElectronPlastMemHealthResult
  isCheckingHealth: boolean
  isRefreshing: boolean
  isRefreshingSidecar: boolean
  isRestartingSidecar: boolean
  isSavingConfig: boolean
  isStartingSidecar: boolean
  isStoppingSidecar: boolean
  statusError: string
  sidecarStatus?: ElectronPlastMemSidecarStatus
  status?: ElectronPlastMemRuntimeStatus
}>()

const emit = defineEmits<{
  refreshHealth: []
  refreshStatus: []
  refreshSidecar: []
  restartSidecar: []
  startSidecar: []
  stopSidecar: []
}>()

const { t } = useI18n()
const tn = (key: string, params?: Record<string, unknown>) => t(`settings.pages.modules.memory-long-term.sections.plast-mem-bridge.${key}`, params ?? {})

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

const statusKind = computed<BridgeStatusKind>(() => {
  if (!props.status)
    return 'checking'
  if (!props.status.enabled)
    return 'disabled'
  return props.status.reachable ? 'online' : 'offline'
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

const checkedAt = computed(() => {
  if (!props.status)
    return '-'

  return new Date(props.status.checkedAt).toLocaleTimeString()
})

const mcpServerStatus = computed(() => props.status?.mcpServer?.state)
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

const sidecarState = computed(() => props.sidecarStatus?.state ?? 'stopped')
const sidecarStatusLabel = computed(() => {
  if (props.sidecarStatus?.external)
    return tn('runtime.sidecar.status.external')

  return tn(`runtime.sidecar.status.${sidecarState.value}`)
})

const sidecarStatusBadgeClass = computed(() => {
  if (props.sidecarStatus?.external)
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
const sidecarCanStop = computed(() => Boolean(props.sidecarStatus?.pid) && ['starting', 'running'].includes(sidecarState.value))
const sidecarCanRestart = computed(() => !props.sidecarStatus?.external && sidecarState.value !== 'stopping')

const modelHealthError = computed(() => {
  const health = props.health
  const modelHealth = health?.modelHealth
  if (!modelHealth)
    return ''

  const errors = [
    modelHealth.chat.ok ? '' : `${tn('health.chat-model')}: ${modelHealth.chat.error ?? '-'}`,
    modelHealth.embedding.ok ? '' : `${tn('health.embedding-model')}: ${modelHealth.embedding.error ?? '-'}`,
  ].filter(Boolean)

  return errors.join('\n')
})

const modelProvidersConfigured = computed(() => {
  const currentStatus = props.status
  if (!currentStatus)
    return false

  const chatConfigured = (currentStatus.openaiChatBaseUrlConfigured ?? currentStatus.openaiBaseUrlConfigured)
    && (currentStatus.openaiChatApiKeyConfigured ?? currentStatus.openaiApiKeyConfigured)
    && Boolean(currentStatus.openaiChatModel)
  const embeddingConfigured = (currentStatus.openaiEmbeddingBaseUrlConfigured ?? currentStatus.openaiBaseUrlConfigured)
    && (currentStatus.openaiEmbeddingApiKeyConfigured ?? currentStatus.openaiApiKeyConfigured)
    && Boolean(currentStatus.openaiEmbeddingModel)

  return chatConfigured && embeddingConfigured
})

const connectionChecks = computed<Array<{ detail: string, icon: string, key: string, kind: ConnectionCheckKind, label: string }>>(() => [
  {
    key: 'service',
    detail: props.status?.error ?? props.status?.baseUrl ?? tn('config.test.details.service'),
    icon: 'i-solar:server-square-bold-duotone',
    kind: props.status ? (props.status.reachable ? 'ok' : 'error') : 'unknown',
    label: tn('config.test.items.service'),
  },
  {
    key: 'database',
    detail: props.health?.databaseError ?? (props.health ? tn('config.test.details.database') : tn('config.test.details.waiting')),
    icon: 'i-solar:database-bold-duotone',
    kind: props.health ? (props.health.databaseOk ? 'ok' : 'error') : 'unknown',
    label: tn('config.test.items.database'),
  },
  {
    key: 'conversation',
    detail: props.health?.conversationId ?? props.status?.workspaceKey ?? tn('config.test.details.conversation'),
    icon: 'i-solar:dialog-2-bold-duotone',
    kind: props.status ? (props.status.conversationIdConfigured ? 'ok' : 'error') : 'unknown',
    label: tn('config.test.items.conversation'),
  },
  {
    key: 'models',
    detail: modelHealthError.value || (props.status?.openaiChatModel ?? props.status?.openaiEmbeddingModel ?? tn('config.test.details.models')),
    icon: 'i-solar:cpu-bold-duotone',
    kind: modelHealthError.value
      ? 'error'
      : props.status
        ? (modelProvidersConfigured.value ? 'ok' : 'error')
        : 'unknown',
    label: tn('config.test.items.models'),
  },
  {
    key: 'sidecar',
    detail: props.sidecarStatus?.lastError ?? sidecarStatusLabel.value,
    icon: 'i-solar:restart-bold-duotone',
    kind: props.sidecarStatus ? (props.sidecarStatus.external || props.sidecarStatus.state === 'running' ? 'ok' : 'error') : 'unknown',
    label: tn('config.test.items.sidecar'),
  },
])

const PANEL = [
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
] as const
</script>

<template>
  <section :class="PANEL">
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
          <span :class="['font-mono', 'text-xs', 'text-neutral-700', 'dark:text-neutral-200']">{{ props.sidecarStatus?.pid ?? '-' }}</span>
        </div>
        <div :class="['min-w-0', 'flex', 'flex-col', 'gap-0.5']">
          <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('runtime.sidecar.command') }}</span>
          <span :class="['truncate', 'font-mono', 'text-xs', 'text-neutral-700', 'dark:text-neutral-200']">{{ props.sidecarStatus?.command ?? '-' }}</span>
        </div>
        <div :class="['min-w-0', 'flex', 'flex-col', 'gap-0.5']">
          <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ tn('runtime.sidecar.cwd') }}</span>
          <span :class="['truncate', 'font-mono', 'text-xs', 'text-neutral-700', 'dark:text-neutral-200']">{{ props.sidecarStatus?.cwd ?? '-' }}</span>
        </div>
      </div>

      <Callout v-if="props.sidecarStatus?.lastError" theme="orange" :label="tn('runtime.sidecar.error')">
        {{ props.sidecarStatus.lastError }}
      </Callout>

      <div :class="['flex', 'flex-wrap', 'items-center', 'justify-end', 'gap-2']">
        <Button
          variant="secondary"
          size="sm"
          :loading="props.isRefreshingSidecar"
          icon="i-solar:refresh-bold-duotone"
          :label="tn('runtime.sidecar.refresh')"
          @click="emit('refreshSidecar')"
        />
        <Button
          variant="secondary"
          size="sm"
          :loading="props.isStartingSidecar || props.isSavingConfig"
          :disabled="!sidecarCanStart"
          icon="i-solar:play-circle-bold-duotone"
          :label="tn('runtime.sidecar.start')"
          @click="emit('startSidecar')"
        />
        <Button
          variant="secondary"
          size="sm"
          :loading="props.isStoppingSidecar"
          :disabled="!sidecarCanStop"
          icon="i-solar:stop-circle-bold-duotone"
          :label="tn('runtime.sidecar.stop')"
          @click="emit('stopSidecar')"
        />
        <Button
          size="sm"
          :loading="props.isRestartingSidecar || props.isSavingConfig"
          :disabled="!sidecarCanRestart"
          icon="i-solar:restart-circle-bold-duotone"
          :label="tn('runtime.sidecar.restart')"
          @click="emit('restartSidecar')"
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
          <span :class="['truncate', 'font-mono', 'text-xs', 'text-neutral-700', 'dark:text-neutral-200']">{{ props.status?.workspaceKey ?? '-' }}</span>
        </div>
      </div>
    </div>

    <Callout v-if="props.statusError" theme="orange" :label="tn('runtime.status-error')">
      {{ props.statusError }}
    </Callout>
    <Callout v-else-if="props.status && !props.status.mcpServer" theme="orange" :label="tn('runtime.mcp-missing-title')">
      {{ tn('runtime.mcp-missing') }}
    </Callout>
    <Callout v-else-if="props.status?.error" theme="orange" :label="tn('runtime.service-error')">
      {{ props.status.error }}
    </Callout>
    <Callout v-else-if="props.status?.enabled && !props.status.conversationIdConfigured" theme="orange" :label="tn('runtime.conversation-missing-title')">
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
          :loading="props.isCheckingHealth"
          icon="i-solar:play-circle-bold-duotone"
          :label="tn('config.test.action')"
          @click="emit('refreshHealth')"
        />
      </div>

      <div :class="['grid', 'grid-cols-1', 'gap-2', 'md:grid-cols-2', 'xl:grid-cols-5']">
        <div
          v-for="check in connectionChecks"
          :key="check.key"
          :class="['min-w-0', 'flex', 'flex-col', 'gap-2', 'rounded-md', 'bg-white/70', 'p-2.5', 'dark:bg-neutral-900/70']"
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
        variant="secondary"
        size="sm"
        :loading="props.isRefreshing"
        icon="i-solar:refresh-bold-duotone"
        :label="tn('runtime.refresh')"
        @click="emit('refreshStatus')"
      />
    </div>
  </section>
</template>
