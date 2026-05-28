import type { BrowserWindow } from 'electron'

import type { RequestWindowPayload } from '../../../shared/eventa'

import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const defineInvokeHandlerMock = vi.hoisted(() => vi.fn())
const safeCloseMock = vi.hoisted(() => vi.fn())
const managerOpenMock = vi.hoisted(() => vi.fn())
const createReferencedWindowManagerMock = vi.hoisted(() => vi.fn(() => ({
  open: managerOpenMock,
  close: vi.fn(),
})))

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()

  return {
    ...actual,
    defineInvokeHandler: defineInvokeHandlerMock,
  }
})

vi.mock('@proj-airi/electron-vueuse/main', () => ({
  safeClose: safeCloseMock,
}))

vi.mock('../../libs/electron/location', () => ({
  baseUrl: vi.fn(() => 'file:///renderer/'),
  getElectronMainDirname: vi.fn(() => '/app/main'),
  load: vi.fn(),
  withHashRoute: vi.fn((_baseUrl: string, route: string) => route),
}))

vi.mock('../shared/referenced-window', () => ({
  createReferencedWindowManager: createReferencedWindowManagerMock,
}))

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {},
  shell: {
    openExternal: vi.fn(),
  },
}))

vi.mock('../../../../resources/icon.png?asset', () => ({
  default: 'icon.png',
}))

function createWindowHandle(id: string) {
  const window = new EventEmitter() as EventEmitter & BrowserWindow

  return {
    id,
    window,
    context: {},
    eventa: {},
  }
}

describe('setupNoticeWindowManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    managerOpenMock.mockReset()
    defineInvokeHandlerMock.mockReset()
  })

  /**
   * @example
   * const openPromise = noticeWindow.open(payload)
   * window.emit('closed')
   * await expect(openPromise).resolves.toBe(false)
   */
  it('resolves false when the notice window closes before sending an explicit action', async () => {
    // ROOT CAUSE:
    //
    // If the user closes the notice window via the native window controls, the renderer never
    // sends `windowAction`.
    // This used to leave `noticeWindow.open()` waiting forever because only explicit actions
    // resolved the Promise.
    //
    // We fixed this by resolving the pending request when the BrowserWindow emits `closed`.
    let actionHandler: ((action: { id: string, action: 'confirm' | 'cancel' | 'close' }) => void) | undefined
    const cleanupWindowActionHandler = vi.fn()
    const handle = createWindowHandle('notice-close')

    managerOpenMock.mockResolvedValue(handle)
    defineInvokeHandlerMock.mockImplementation((
      _context: unknown,
      _event: unknown,
      handler: (action: { id: string, action: 'confirm' | 'cancel' | 'close' }) => void,
    ) => {
      actionHandler = handler
      return cleanupWindowActionHandler
    })

    const { setupNoticeWindowManager } = await import('./index')
    const noticeWindow = setupNoticeWindowManager({
      i18n: {} as never,
      serverChannel: {} as never,
    })

    const openPromise = noticeWindow.open({
      route: '/notice/fade-on-hover',
      type: 'fade-on-hover',
    } satisfies RequestWindowPayload)

    await vi.waitFor(() => {
      expect(actionHandler).toBeTypeOf('function')
    })

    handle.window.emit('closed')

    await expect(openPromise).resolves.toBe(false)
    expect(cleanupWindowActionHandler).toHaveBeenCalledOnce()
    expect(safeCloseMock).not.toHaveBeenCalled()
  })

  /**
   * @example
   * actionHandler?.({ id: 'notice-confirm', action: 'confirm' })
   * await expect(openPromise).resolves.toBe(true)
   */
  it('resolves the requested result when the renderer reports a matching notice action', async () => {
    let actionHandler: ((action: { id: string, action: 'confirm' | 'cancel' | 'close' }) => void) | undefined
    const cleanupWindowActionHandler = vi.fn()
    const handle = createWindowHandle('notice-confirm')

    managerOpenMock.mockResolvedValue(handle)
    defineInvokeHandlerMock.mockImplementation((
      _context: unknown,
      _event: unknown,
      handler: (action: { id: string, action: 'confirm' | 'cancel' | 'close' }) => void,
    ) => {
      actionHandler = handler
      return cleanupWindowActionHandler
    })

    const { setupNoticeWindowManager } = await import('./index')
    const noticeWindow = setupNoticeWindowManager({
      i18n: {} as never,
      serverChannel: {} as never,
    })

    const openPromise = noticeWindow.open({
      route: '/notice/fade-on-hover',
      type: 'fade-on-hover',
    } satisfies RequestWindowPayload)

    await vi.waitFor(() => {
      expect(actionHandler).toBeTypeOf('function')
    })

    actionHandler?.({ id: 'notice-confirm', action: 'confirm' })

    await expect(openPromise).resolves.toBe(true)
    expect(cleanupWindowActionHandler).toHaveBeenCalledOnce()
    expect(safeCloseMock).toHaveBeenCalledWith(handle.window)
  })
})
