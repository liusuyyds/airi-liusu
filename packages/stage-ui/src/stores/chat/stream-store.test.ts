import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, watch } from 'vue'

import { useChatStreamStore } from './stream-store'

const mocks = vi.hoisted(() => ({
  appendSessionMessage: vi.fn(),
}))

vi.mock('../../../../stage-shared/src/composables/use-local-storage-manual-reset', () => ({
  useLocalStorageManualReset: <T>(_key: string, initialValue: T) => {
    const state = {
      value: initialValue,
      reset: () => {
        state.value = initialValue
      },
    }
    return state
  },
}))

vi.mock('./session-store', () => ({
  useChatSessionStore: () => ({
    activeSessionId: 'session-1',
    appendSessionMessage: mocks.appendSessionMessage,
  }),
}))

describe('chat stream store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.appendSessionMessage.mockReset()
  })

  it('updates shallowRef-backed streaming message when appending remote stream literals', async () => {
    /**
     * @example
     * store.appendStreamLiteral('hello')
     * expect(store.streamingMessage.content).toBe('hello')
     */
    const store = useChatStreamStore()
    store.beginStream()

    const observed: string[] = []
    const stop = watch(
      () => store.streamingMessage.content,
      value => observed.push(String(value ?? '')),
    )

    store.appendStreamLiteral('hello')
    await nextTick()

    expect(store.streamingMessage.content).toBe('hello')
    expect(store.streamingMessage.slices).toEqual([{ type: 'text', text: 'hello' }])
    expect(observed).toEqual(['hello'])

    store.appendStreamLiteral(' world')
    await nextTick()

    expect(store.streamingMessage.content).toBe('hello world')
    expect(store.streamingMessage.slices).toEqual([{ type: 'text', text: 'hello world' }])
    expect(observed.at(-1)).toBe('hello world')

    stop()
  })
})
