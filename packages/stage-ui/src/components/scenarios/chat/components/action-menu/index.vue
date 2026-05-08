<script setup lang="ts">
import type { ComponentPublicInstance, Ref } from 'vue'

import type { ChatActionMenuAction } from '.'

import { isStageCapacitor, isStageWeb } from '@proj-airi/stage-shared'
import { useIntervalFn } from '@vueuse/core'
import { createTimeline } from 'animejs'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed, reactive, ref, shallowRef, toRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWebHaptics } from 'web-haptics/vue'

import { createChatActionMenuItems } from '.'
import { useBreakpoints } from '../../../../../composables/use-breakpoints'

const props = withDefaults(defineProps<{
  canCopy?: boolean
  canRetry?: boolean
  canDelete?: boolean
  copyText?: string
  menuLabel?: string
  placement?: 'left' | 'right'
}>(), {
  canCopy: true,
  canRetry: false,
  canDelete: true,
  copyText: '',
  menuLabel: 'Message actions',
  placement: 'right',
})

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'retry'): void
  (e: 'delete'): void
}>()
defineSlots<{
  default: (props: { setMeasuredElement: (element: Element | ComponentPublicInstance | null) => void }) => unknown
}>()

const measuredElementRef = shallowRef<HTMLElement | null>(null)
const contextMenuContainerElementRef = useTemplateRef<HTMLElement>('contextMenuContainer')
const contextMenuOpen = shallowRef(false)

const { trigger } = useWebHaptics()
const { isMobile } = useBreakpoints()
const { t } = useI18n()
const shouldDisableDropdownMenu = computed(() => (isStageWeb() || isStageCapacitor()) && isMobile.value)

const menuItems = computed(() => createChatActionMenuItems({
  canCopy: props.canCopy && props.copyText.trim().length > 0,
  canRetry: props.canRetry,
  canDelete: props.canDelete,
  retryLabel: t('stage.chat.actions.retry'),
}))
const forceVisible = computed(() => contextMenuOpen.value)

const contentClasses = [
  'z-10000 min-w-36 rounded-xl p-1 shadow-md outline-none',
  'border border-neutral-100/70 bg-white/90 text-neutral-700 backdrop-blur-md',
  'dark:border-neutral-900/80 dark:bg-neutral-900/90 dark:text-neutral-100',
  'data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade',
  'data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade',
]

const itemClasses = [
  'relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm leading-none outline-none',
  'data-[disabled]:pointer-events-none data-[highlighted]:bg-primary-50/80 dark:data-[highlighted]:bg-primary-900/40',
  'transition-colors duration-150 ease-in-out',
]

async function handleAction(action: ChatActionMenuAction) {
  if (action === 'copy') {
    if (props.copyText.trim()) {
      await navigator.clipboard.writeText(props.copyText)
      emit('copy')
    }
    return
  }

  if (action === 'retry') {
    emit('retry')
    return
  }

  emit('delete')
}

function handleContextMenuOpenChange(open: boolean) {
  contextMenuOpen.value = open
}

function setMeasuredElement(element: Element | ComponentPublicInstance | null) {
  measuredElementRef.value = element instanceof HTMLElement ? element : null
}

// NOTICE:
// Previously each ChatActionMenu instance created its own:
//   - 2× useElementVisibility → 2 IntersectionObservers
//   - 1× useElementScroll → 2 useElementBounding + 1 ResizeObserver + 1 window resize listener
// With 200 messages that means 400+ IntersectionObservers, 200+ ResizeObservers, and
// 200+ window resize listeners — all competing for the same scroll/resize events.
//
// Replaced with a simple CSS-only approach: the trigger button is positioned at the
// vertical center of the message using `top-1/2 -translate-y-1/2` (line 255). The
// inline trigger sits outside the message on hover
// (group-hover/chat-action:opacity-100) — no JS observers needed.
function useTouching(element: Ref<HTMLElement | null>) {
  const elementRef = toRef(element)

  const pressStartTime = ref(0)
  const pressNow = ref(0)

  const { resume, pause } = useIntervalFn(() => pressNow.value = Date.now(), 50)

  const isTouching = ref(false)

  function handleTouchStart() {
    isTouching.value = true
    pressStartTime.value = Date.now()
    resume()
  }

  function handleTouchMove() {
    isTouching.value = true
  }

  function handleTouchEnd() {
    isTouching.value = false
    pressStartTime.value = 0
    pause()
  }

  function handleTouchCancel() {
    isTouching.value = false
    pressStartTime.value = 0
    pause()
  }

  watch(elementRef, (newElement, oldElement) => {
    if (oldElement) {
      oldElement.removeEventListener('touchstart', handleTouchStart)
      oldElement.removeEventListener('touchmove', handleTouchMove)
      oldElement.removeEventListener('touchend', handleTouchEnd)
      oldElement.removeEventListener('touchcancel', handleTouchCancel)
    }
    if (newElement) {
      newElement.addEventListener('touchstart', handleTouchStart, { passive: true })
      newElement.addEventListener('touchmove', handleTouchMove, { passive: true })
      newElement.addEventListener('touchend', handleTouchEnd, { passive: true })
      newElement.addEventListener('touchcancel', handleTouchCancel, { passive: true })
    }
  }, { immediate: true })

  return {
    isTouching,
  }
}

function useSetTimeoutFn(fn: () => void, options?: { delay?: number, onClear?: () => void }) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const delay = options?.delay ?? 1000

  function trigger(options?: { delay?: number }) {
    if (timeoutId !== null)
      return

    const effectiveDelay = options?.delay ?? delay

    timeoutId = setTimeout(() => {
      fn()
      timeoutId = null
    }, effectiveDelay)
  }

  function clear() {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
      options?.onClear?.()
    }
  }

  return {
    trigger,
    clear,
  }
}

const { isTouching } = useTouching(contextMenuContainerElementRef)

const pressedAnimatable = reactive({ scale: 100 })
const tl = createTimeline({ defaults: { duration: 500, autoplay: false } })
  .add(pressedAnimatable, { scale: 90, ease: 'inOut', autoplay: false })
  .reset()

const { trigger: triggerTimer, clear: clearTimer } = useSetTimeoutFn(() => {
  trigger('medium')
  tl.reset()
}, { delay: 700 })

watch(isTouching, (val) => {
  if (val) {
    if (tl.completed || tl.paused) {
      tl.restart()
    }
    else {
      tl.play()
    }

    triggerTimer()
  }
  else {
    tl.reset()

    clearTimer()
  }
})
</script>

<template>
  <ContextMenuRoot @update:open="handleContextMenuOpenChange">
    <ContextMenuTrigger as-child>
      <div
        ref="contextMenuContainer"
        :class="[
          'group/chat-action relative w-fit',
          'transition-transform duration-150 ease-in-out',
        ]"
        :style="{
          transform: `scale(${pressedAnimatable.scale / 100})`,
        }"
      >
        <DropdownMenuRoot>
          <DropdownMenuTrigger
            v-if="!shouldDisableDropdownMenu"
            as-child
            :class="[
              'absolute z-10 opacity-0 transition-opacity duration-200',
              'group-hover/chat-action:opacity-100 group-focus-within/chat-action:opacity-100',
              forceVisible ? 'opacity-100' : '',
              props.placement === 'left'
                ? 'left-0 top-1/2 translate-x-[calc(-100%-8px)] -translate-y-1/2'
                : 'right-0 top-1/2 translate-x-[calc(100%+8px)] -translate-y-1/2',
            ]"
          >
            <button
              :class="[
                'pointer-events-auto h-8 w-8 flex items-center justify-center rounded-lg',
                'bg-white/85 text-neutral-500 backdrop-blur-sm',
                'dark:bg-neutral-900/85 dark:text-neutral-300',
                'transition-colors hover:text-primary-500 dark:hover:text-primary-300',
              ]"
              :aria-label="menuLabel"
            >
              <div class="i-solar:menu-dots-bold text-base" />
            </button>
          </DropdownMenuTrigger>

          <slot :set-measured-element="setMeasuredElement" />

          <DropdownMenuPortal>
            <DropdownMenuContent
              align="end"
              side="bottom"
              :side-offset="6"
              :class="contentClasses"
            >
              <DropdownMenuItem
                v-for="item in menuItems"
                :key="item.action"
                :class="[
                  ...itemClasses,
                  item.danger
                    ? 'text-red-500 data-[highlighted]:bg-red-50/80 dark:data-[highlighted]:bg-red-950/40'
                    : '',
                ]"
                @select="() => void handleAction(item.action)"
              >
                <div :class="[item.icon, 'text-xs']" />
                <span>{{ item.label }}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
    </ContextMenuTrigger>

    <ContextMenuPortal>
      <ContextMenuContent
        :class="[
          ...contentClasses,
        ]"
      >
        <ContextMenuItem
          v-for="item in menuItems"
          :key="item.action"
          :class="[
            ...itemClasses,
            item.danger
              ? 'text-red-500 data-[highlighted]:bg-red-50/80 dark:data-[highlighted]:bg-red-950/40'
              : '',
          ]"
          @select="() => void handleAction(item.action)"
        >
          <div
            :class="[
              item.icon, 'text-xs',
            ]"
          />
          <span>
            {{ item.label }}
          </span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>
