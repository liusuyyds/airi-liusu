<script setup lang="ts">
import type { ElectronPlastMemEpisodicMemory } from '../../../../../shared/eventa'

import { Button, Callout } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  isLoadingRecentMemories: boolean
  recentMemories: ElectronPlastMemEpisodicMemory[]
  recentMemoriesError: string
}>()

const emit = defineEmits<{
  refresh: []
}>()

const { t } = useI18n()
const tn = (key: string, params?: Record<string, unknown>) => t(`settings.pages.modules.memory-long-term.sections.plast-mem-bridge.${key}`, params ?? {})

function formatMemoryTime(value: string | undefined) {
  if (!value)
    return '-'

  return new Date(value).toLocaleString()
}

function classificationLabel(classification: string | null | undefined) {
  if (classification === 'informative')
    return tn('recent-memories.classification.informative')
  if (classification === 'low_info')
    return tn('recent-memories.classification.low-info')
  return '-'
}

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
        <div :class="['i-solar:brain-bold-duotone', 'text-xl', 'text-primary-500', 'dark:text-primary-300']" />
        <h3 :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
          {{ tn('recent-memories.title') }}
        </h3>
      </div>
      <Button
        variant="secondary"
        size="sm"
        :loading="props.isLoadingRecentMemories"
        icon="i-solar:refresh-bold-duotone"
        :label="tn('recent-memories.refresh')"
        @click="emit('refresh')"
      />
    </div>

    <Callout v-if="props.recentMemoriesError" theme="orange" :label="tn('recent-memories.error')">
      {{ props.recentMemoriesError }}
    </Callout>

    <div v-if="props.recentMemories.length === 0 && !props.recentMemoriesError && !props.isLoadingRecentMemories" :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
      {{ tn('recent-memories.empty') }}
    </div>

    <div :class="['flex', 'flex-col', 'gap-2', 'max-h-80', 'overflow-y-auto']">
      <div
        v-for="memory in props.recentMemories"
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
              'shrink-0',
              'rounded-full',
              'px-1.5',
              'py-0.5',
              'text-[10px]',
              'font-medium',
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
</template>
