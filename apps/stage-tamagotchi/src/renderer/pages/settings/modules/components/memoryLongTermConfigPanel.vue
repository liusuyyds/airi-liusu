<script setup lang="ts">
import type { ElectronPlastMemConfig } from '../../../../../shared/eventa'

import { Button, Callout, Collapsible, FieldCheckbox, FieldInput, FieldSelect, Input } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

interface ReviewWindowOption {
  label: string
  value: number
}

const props = defineProps<{
  configuredByUser?: boolean
  configError: string
  configSavedMessage: string
  isLoadingConfig: boolean
  isRefreshing: boolean
  isSavingConfig: boolean
  isTestingConnection: boolean
  reviewWindowOptions: ReviewWindowOption[]
}>()

const emit = defineEmits<{
  reload: []
  save: []
  saveAndCheck: []
}>()

const configDraft = defineModel<ElectronPlastMemConfig>({ required: true })
const apiKeyVisible = defineModel<boolean>('apiKeyVisible', { required: true })
const advancedConfigVisible = defineModel<boolean>('advancedConfigVisible', { required: true })

const { t } = useI18n()
const tn = (key: string, params?: Record<string, unknown>) => t(`settings.pages.modules.memory-long-term.sections.plast-mem-bridge.${key}`, params ?? {})

const advancedConfigSummary = computed(() => [
  tn('config.fields.conversation-id.label'),
  tn('config.fields.workspace-key.label'),
  tn('config.fields.review-window-hours.label'),
  tn('config.fields.request-timeout-msec.label'),
].join(' / '))

const sourceLabel = computed(() => props.configuredByUser ? tn('config.source.ui') : tn('config.source.env'))
const apiKeyInputType = computed(() => apiKeyVisible.value ? 'text' : 'password')

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
        {{ sourceLabel }}
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
              placeholder="postgres://plastmem:plastmem@localhost:5433/plastmem"
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

          <div :class="['grid', 'grid-cols-1', 'gap-4', '2xl:grid-cols-2']">
            <div :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'border', 'border-neutral-200/70', 'p-3', 'dark:border-neutral-800/70']">
              <div :class="['flex', 'flex-col', 'gap-1']">
                <h5 :class="['text-xs', 'font-semibold', 'uppercase', 'text-neutral-500', 'dark:text-neutral-400']">
                  {{ tn('config.groups.models.chat.title') }}
                </h5>
                <p :class="['text-xs', 'text-neutral-500', 'leading-5', 'dark:text-neutral-400']">
                  {{ tn('config.groups.models.chat.description') }}
                </p>
              </div>

              <div :class="['grid', 'grid-cols-1', 'gap-4', 'lg:grid-cols-2']">
                <FieldInput
                  v-model="configDraft.openaiChatModel"
                  :label="tn('config.fields.openai-chat-model.label')"
                  :description="tn('config.fields.openai-chat-model.description')"
                  placeholder="Qwen/Qwen3.5-9B"
                />
                <FieldInput
                  v-model="configDraft.openaiChatBaseUrl"
                  :label="tn('config.fields.openai-chat-base-url.label')"
                  :description="tn('config.fields.openai-chat-base-url.description')"
                  placeholder="https://api.z.ai/api/paas/v4/"
                />

                <div :class="['max-w-full', 'lg:col-span-2', '2xl:col-span-1']">
                  <label :class="['flex', 'flex-col', 'gap-4']">
                    <div>
                      <div :class="['flex', 'items-center', 'gap-1', 'text-sm', 'font-medium']">
                        {{ tn('config.fields.openai-chat-api-key.label') }}
                      </div>
                      <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']" text-wrap>
                        {{ tn('config.fields.openai-chat-api-key.description') }}
                      </div>
                    </div>
                    <div :class="['flex', 'items-center', 'gap-2']">
                      <Input
                        v-model="configDraft.openaiChatApiKey"
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
              </div>
            </div>

            <div :class="['flex', 'flex-col', 'gap-3', 'rounded-md', 'border', 'border-neutral-200/70', 'p-3', 'dark:border-neutral-800/70']">
              <div :class="['flex', 'flex-col', 'gap-1']">
                <h5 :class="['text-xs', 'font-semibold', 'uppercase', 'text-neutral-500', 'dark:text-neutral-400']">
                  {{ tn('config.groups.models.embedding.title') }}
                </h5>
                <p :class="['text-xs', 'text-neutral-500', 'leading-5', 'dark:text-neutral-400']">
                  {{ tn('config.groups.models.embedding.description') }}
                </p>
              </div>

              <div :class="['grid', 'grid-cols-1', 'gap-4', 'lg:grid-cols-2']">
                <FieldInput
                  v-model="configDraft.openaiEmbeddingModel"
                  :label="tn('config.fields.openai-embedding-model.label')"
                  :description="tn('config.fields.openai-embedding-model.description')"
                  placeholder="Qwen/Qwen3-Embedding-0.6B"
                />
                <FieldInput
                  v-model="configDraft.openaiEmbeddingBaseUrl"
                  :label="tn('config.fields.openai-embedding-base-url.label')"
                  :description="tn('config.fields.openai-embedding-base-url.description')"
                  placeholder="https://api.siliconflow.cn/v1/"
                />

                <div :class="['max-w-full', 'lg:col-span-2', '2xl:col-span-1']">
                  <label :class="['flex', 'flex-col', 'gap-4']">
                    <div>
                      <div :class="['flex', 'items-center', 'gap-1', 'text-sm', 'font-medium']">
                        {{ tn('config.fields.openai-embedding-api-key.label') }}
                      </div>
                      <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']" text-wrap>
                        {{ tn('config.fields.openai-embedding-api-key.description') }}
                      </div>
                    </div>
                    <div :class="['flex', 'items-center', 'gap-2']">
                      <Input
                        v-model="configDraft.openaiEmbeddingApiKey"
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
              </div>
            </div>
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
            <FieldSelect
              v-model="configDraft.reviewWindowHours"
              :label="tn('config.fields.review-window-hours.label')"
              :description="tn('config.fields.review-window-hours.description')"
              :options="props.reviewWindowOptions"
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

    <Callout v-if="props.configError" theme="orange" :label="tn('config.error')">
      {{ props.configError }}
    </Callout>
    <Callout v-else-if="props.configSavedMessage" theme="lime" :label="props.configSavedMessage">
      {{ tn('config.saved-description') }}
    </Callout>

    <div :class="['flex', 'flex-wrap', 'items-center', 'justify-end', 'gap-2']">
      <Button
        variant="secondary"
        size="sm"
        :loading="props.isLoadingConfig"
        icon="i-solar:refresh-bold-duotone"
        :label="tn('config.reload')"
        @click="emit('reload')"
      />
      <Button
        variant="secondary"
        size="sm"
        :loading="props.isSavingConfig"
        icon="i-solar:diskette-bold-duotone"
        :label="tn('config.save')"
        @click="emit('save')"
      />
      <Button
        size="sm"
        :loading="props.isTestingConnection || props.isSavingConfig || props.isRefreshing"
        icon="i-solar:plug-circle-bold-duotone"
        :label="tn('config.save-and-check')"
        @click="emit('saveAndCheck')"
      />
    </div>
  </section>
</template>
