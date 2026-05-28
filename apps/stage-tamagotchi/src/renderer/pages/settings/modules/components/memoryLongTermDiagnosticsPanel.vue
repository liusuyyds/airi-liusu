<script setup lang="ts">
import type { ElectronPlastMemRuntimeStatus } from '../../../../../shared/eventa'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

type ChatAttemptState = 'accepted' | 'error' | 'empty' | 'idle' | 'recalled' | 'rejected'

const props = defineProps<{
  status?: ElectronPlastMemRuntimeStatus
}>()

const { t } = useI18n()
const tn = (key: string, params?: Record<string, unknown>) => t(`settings.pages.modules.memory-long-term.sections.plast-mem-bridge.${key}`, params ?? {})

function chatAttemptBadgeClass(state: ChatAttemptState) {
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

function formatCapturedMessageSpeaker(message: { name?: string, role: string }) {
  const name = message.name?.trim()
  if (name)
    return tn('chat-diagnostics.ingest.capture.speaker-named', { name, role: message.role })
  if (message.role === 'user')
    return tn('chat-diagnostics.ingest.capture.role.user')
  if (message.role === 'assistant')
    return tn('chat-diagnostics.ingest.capture.role.assistant')
  return message.role
}

function formatCapturedMessageTime(value: number | string | undefined) {
  if (!value)
    return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return String(value)

  return date.toLocaleTimeString()
}

function contextSourceLabel(source: string) {
  const label = tn(`chat-diagnostics.contexts.source.${source}`)
  return label === `settings.pages.modules.memory-long-term.sections.plast-mem-bridge.chat-diagnostics.contexts.source.${source}` ? source : label
}

function formatCount(value: number | undefined) {
  return new Intl.NumberFormat().format(value ?? 0)
}

const recallDiagnostics = computed(() => props.status?.chatDiagnostics?.recall ?? { status: 'idle' as const })
const ingestDiagnostics = computed(() => props.status?.chatDiagnostics?.ingest ?? { status: 'idle' as const })
const contextDiagnostics = computed(() => props.status?.chatDiagnostics?.contexts ?? [])
const capturedIngestMessages = computed(() => ingestDiagnostics.value.messages ?? [])
const hasCapturedIngestMessages = computed(() => capturedIngestMessages.value.length > 0)
const recallStatusBadgeClass = computed(() => chatAttemptBadgeClass(recallDiagnostics.value.status))
const ingestStatusBadgeClass = computed(() => chatAttemptBadgeClass(ingestDiagnostics.value.status))
const recallStatusLabel = computed(() => tn(`chat-diagnostics.recall.status.${recallDiagnostics.value.status}`))
const ingestStatusLabel = computed(() => tn(`chat-diagnostics.ingest.status.${ingestDiagnostics.value.status}`))
const recallContextPreview = computed(() => recallDiagnostics.value.contextBlock?.trim() ?? '')
const hasRecallContextPreview = computed(() => recallContextPreview.value.length > 0)

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
          <div v-if="hasCapturedIngestMessages" :class="['mt-2', 'flex', 'flex-col', 'gap-2']">
            <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
              <span :class="['text-[10px]', 'font-medium', 'uppercase', 'text-neutral-400', 'dark:text-neutral-500']">
                {{ tn('chat-diagnostics.ingest.capture.title') }}
              </span>
              <span :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                {{ tn('chat-diagnostics.ingest.capture.count', { count: capturedIngestMessages.length }) }}
              </span>
            </div>
            <div :class="['flex', 'max-h-56', 'flex-col', 'gap-2', 'overflow-auto', 'rounded-md', 'bg-white/70', 'p-2', 'dark:bg-neutral-900/70']">
              <div
                v-for="(message, index) in capturedIngestMessages"
                :key="`${message.role}:${message.timestamp ?? index}:${index}`"
                :class="['min-w-0', 'flex', 'flex-col', 'gap-1', 'rounded-md', 'bg-neutral-100/70', 'p-2', 'dark:bg-neutral-950/50']"
              >
                <div :class="['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-2']">
                  <span :class="['text-[11px]', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                    {{ formatCapturedMessageSpeaker(message) }}
                  </span>
                  <span v-if="message.timestamp" :class="['font-mono', 'text-[10px]', 'text-neutral-400', 'dark:text-neutral-500']">
                    {{ formatCapturedMessageTime(message.timestamp) }}
                  </span>
                </div>
                <p :class="['whitespace-pre-wrap', 'break-words', 'text-[11px]', 'text-neutral-600', 'leading-4', 'dark:text-neutral-300']">
                  {{ message.content }}
                </p>
              </div>
            </div>
          </div>
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
</template>
