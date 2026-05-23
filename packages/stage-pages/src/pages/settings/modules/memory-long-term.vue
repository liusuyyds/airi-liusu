<script setup lang="ts">
import { WIP } from '@proj-airi/stage-ui/components'
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
]
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-4']">
    <WIP />

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
