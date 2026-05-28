import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePluginHostInspectorStore } from './plugin-host-debug'

describe('plugin host debug store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /**
   * @example
   * await store.refreshInspection()
   * expect(store.modules[0]?.moduleId).toBe('module:weather')
   */
  it('stores registry auto-reload state and module snapshots from inspection responses', async () => {
    const store = usePluginHostInspectorStore()
    const registry = {
      root: '/plugins',
      plugins: [
        {
          name: 'weather',
          entrypoints: { main: './dist/index.js' },
          path: '/plugins/weather/plugin.json',
          enabled: true,
          autoReload: true,
          loaded: true,
          isNew: false,
        },
      ],
    }

    store.setBridge({
      list: vi.fn(async () => registry),
      setEnabled: vi.fn(async () => registry),
      setAutoReload: vi.fn(async () => registry),
      loadEnabled: vi.fn(async () => registry),
      load: vi.fn(async () => registry),
      unload: vi.fn(async () => registry),
      inspect: vi.fn(async () => ({
        registry,
        sessions: [
          {
            id: 'session-1',
            manifestName: 'weather',
            phase: 'ready',
            runtime: 'node' as const,
            moduleId: 'module:weather',
          },
        ],
        kits: [
          {
            kitId: 'kit:weather',
            version: '1.0.0',
            capabilities: [{ key: 'forecast', actions: ['get'] }],
            runtimes: ['node' as const],
          },
        ],
        modules: [
          {
            moduleId: 'module:weather',
            ownerSessionId: 'session-1',
            ownerPluginId: 'weather',
            kitId: 'kit:weather',
            kitModuleType: 'widget',
            state: 'active' as const,
            runtime: 'node' as const,
            revision: 3,
            updatedAt: 123456,
            config: { region: 'global' },
          },
        ],
        capabilities: [
          {
            key: 'forecast',
            state: 'ready' as const,
            metadata: { source: 'plugin' },
            updatedAt: 123456,
          },
        ],
        refreshedAt: 123456,
      })),
    })

    await store.refreshInspection()

    expect(store.discoveredPlugins).toHaveLength(1)
    expect(store.discoveredPlugins[0]?.autoReload).toBe(true)
    expect(store.modules).toHaveLength(1)
    expect(store.modules[0]?.moduleId).toBe('module:weather')
    expect(store.modules[0]?.config).toEqual({ region: 'global' })
  })
})
