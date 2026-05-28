<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
  'OPENAI_CHAT_BASE_URL',
  'OPENAI_CHAT_API_KEY',
  'OPENAI_CHAT_MODEL',
  'OPENAI_EMBEDDING_BASE_URL',
  'OPENAI_EMBEDDING_API_KEY',
  'OPENAI_EMBEDDING_MODEL',
  'OPENAI_CHAT_MAX_TOKENS',
  'OPENAI_REQUEST_TIMEOUT_SECONDS',
  'PLAST_MEM_REVIEW_WINDOW_HOURS',
]

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
</template>
