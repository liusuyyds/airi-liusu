import { beforeEach, describe, expect, it, vi } from 'vitest'

const plastMemChatMemoryStoreMock = vi.hoisted(() => ({
  dispose: vi.fn(),
  initialize: vi.fn(async () => {}),
}))

vi.mock('./plast-mem-chat-memory', () => ({
  usePlastMemChatMemoryStore: () => plastMemChatMemoryStoreMock,
}))

/**
 * @example
 * const lifecycle = createPlastMemChatMemoryWindowLifecycle('authority')
 * await lifecycle.initialize()
 * expect(plastMemChatMemoryStoreMock.initialize).toHaveBeenCalledOnce()
 */
describe('createPlastMemChatMemoryWindowLifecycle', async () => {
  const { createPlastMemChatMemoryWindowLifecycle } = await import('./plast-mem-chat-memory-lifecycle')

  beforeEach(() => {
    plastMemChatMemoryStoreMock.dispose.mockClear()
    plastMemChatMemoryStoreMock.initialize.mockClear()
  })

  /**
   * @example
   * await createPlastMemChatMemoryWindowLifecycle('authority').initialize()
   * expect(plastMemChatMemoryStoreMock.initialize).toHaveBeenCalledOnce()
   */
  it('registers Plast Mem hooks only in the chat-sync authority window', async () => {
    const lifecycle = createPlastMemChatMemoryWindowLifecycle('authority')

    await lifecycle.initialize()
    lifecycle.dispose()

    expect(lifecycle.ownsBridge).toBe(true)
    expect(plastMemChatMemoryStoreMock.initialize).toHaveBeenCalledTimes(1)
    expect(plastMemChatMemoryStoreMock.dispose).toHaveBeenCalledTimes(1)
  })

  /**
   * @example
   * await createPlastMemChatMemoryWindowLifecycle('follower').initialize()
   * expect(plastMemChatMemoryStoreMock.initialize).not.toHaveBeenCalled()
   */
  it('does not let follower chat windows replace the Plast Mem bridge owner', async () => {
    const lifecycle = createPlastMemChatMemoryWindowLifecycle('follower')

    await lifecycle.initialize()
    lifecycle.dispose()

    expect(lifecycle.ownsBridge).toBe(false)
    expect(plastMemChatMemoryStoreMock.initialize).not.toHaveBeenCalled()
    expect(plastMemChatMemoryStoreMock.dispose).not.toHaveBeenCalled()
  })
})
