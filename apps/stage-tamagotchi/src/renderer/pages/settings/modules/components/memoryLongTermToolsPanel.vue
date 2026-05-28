<script setup lang="ts">
import type {
  ElectronPlastMemChatMessage,
  ElectronPlastMemRetrieveMemoryRawResult,
} from '../../../../../shared/eventa'

import { Button, Callout, FieldInput } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  importableChatMessages: ElectronPlastMemChatMessage[]
  isManualImporting: boolean
  isPreviewingRecall: boolean
  manualImportError: string
  manualImportMessage: string
  previewError: string
  previewResult?: ElectronPlastMemRetrieveMemoryRawResult
}>()

const emit = defineEmits<{
  import: []
  preview: []
}>()

const manualImportMessageLimit = defineModel<number>('manualImportMessageLimit', { required: true })
const previewQuery = defineModel<string>('previewQuery', { required: true })

const { t } = useI18n()
const tn = (key: string, params?: Record<string, unknown>) => t(`settings.pages.modules.memory-long-term.sections.plast-mem-bridge.${key}`, params ?? {})

function formatCount(value: number | undefined) {
  return new Intl.NumberFormat().format(value ?? 0)
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
                {{ tn('manual-import.description', { count: props.importableChatMessages.length }) }}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            :loading="props.isManualImporting"
            icon="i-solar:upload-square-bold-duotone"
            :label="tn('manual-import.action')"
            @click="emit('import')"
          />
        </div>

        <FieldInput
          v-model="manualImportMessageLimit"
          type="number"
          :label="tn('manual-import.limit.label')"
          :description="tn('manual-import.limit.description')"
          placeholder="20"
        />
        <Callout v-if="props.manualImportError" theme="orange" :label="tn('manual-import.error')">
          {{ props.manualImportError }}
        </Callout>
        <Callout v-else-if="props.manualImportMessage" theme="lime" :label="props.manualImportMessage">
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
            :loading="props.isPreviewingRecall"
            icon="i-solar:eye-bold-duotone"
            :label="tn('recall-preview.action')"
            @click="emit('preview')"
          />
        </div>

        <FieldInput
          v-model="previewQuery"
          :label="tn('recall-preview.query.label')"
          :description="tn('recall-preview.query.description')"
          :placeholder="tn('recall-preview.query.placeholder')"
        />
        <Callout v-if="props.previewError" theme="orange" :label="tn('recall-preview.error')">
          {{ props.previewError }}
        </Callout>
        <div
          v-if="props.previewResult"
          :class="['grid', 'grid-cols-2', 'gap-2']"
        >
          <div :class="['rounded-md', 'bg-white/70', 'p-2.5', 'dark:bg-neutral-900/70']">
            <span :class="['text-[10px]', 'font-medium', 'uppercase', 'text-neutral-400', 'dark:text-neutral-500']">{{ tn('recall-preview.semantic') }}</span>
            <span :class="['block', 'font-mono', 'text-lg', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">{{ formatCount(props.previewResult.semantic.length) }}</span>
          </div>
          <div :class="['rounded-md', 'bg-white/70', 'p-2.5', 'dark:bg-neutral-900/70']">
            <span :class="['text-[10px]', 'font-medium', 'uppercase', 'text-neutral-400', 'dark:text-neutral-500']">{{ tn('recall-preview.episodic') }}</span>
            <span :class="['block', 'font-mono', 'text-lg', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">{{ formatCount(props.previewResult.episodic.length) }}</span>
          </div>
        </div>
        <div v-if="props.previewResult" :class="['flex', 'flex-col', 'gap-2', 'max-h-72', 'overflow-y-auto']">
          <div
            v-for="memory in props.previewResult.semantic"
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
            v-for="memory in props.previewResult.episodic"
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
</template>
