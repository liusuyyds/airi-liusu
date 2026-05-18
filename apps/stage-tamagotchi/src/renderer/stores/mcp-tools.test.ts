import type { Tool } from '@xsai/shared-chat'

import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { useMcpStore } from '@proj-airi/stage-ui/stores/mcp'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMocks = vi.hoisted(() => ({
  callMcpTool: vi.fn(async () => ({
    content: [{ type: 'text', text: 'ok' }],
    isError: false,
  })),
  listMcpTools: vi.fn(async () => [{
    serverName: 'filesystem',
    name: 'filesystem::search',
    toolName: 'search',
    description: 'Search files.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  }]),
}))

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: (event: { receiveEvent?: { id?: string } }) => {
    if (event?.receiveEvent?.id === 'eventa:invoke:electron:mcp:list-tools-receive')
      return invokeMocks.listMcpTools
    if (event?.receiveEvent?.id === 'eventa:invoke:electron:mcp:call-tool-receive')
      return invokeMocks.callMcpTool

    throw new Error(`Unexpected eventa invoke: ${JSON.stringify(event)}`)
  },
}))

describe('useTamagotchiMcpToolsStore', async () => {
  const { useTamagotchiMcpToolsStore } = await import('./mcp-tools')

  beforeEach(() => {
    setActivePinia(createPinia())
    useMcpStore().sanitizeToolResults = false
    invokeMocks.listMcpTools.mockClear()
    invokeMocks.callMcpTool.mockClear()
  })

  /**
   * @example
   * await store.refresh()
   * expect(llmToolsStore.toolsByProvider.mcp).toHaveLength(2)
   */
  it('loads MCP tools, proxies execution, and clears them from the shared llm-tools store', async () => {
    const llmToolsStore = useLlmToolsStore()
    const store = useTamagotchiMcpToolsStore()
    const toolOptions = {} as Parameters<Tool['execute']>[1]

    await store.refresh()

    const mcpTools = llmToolsStore.toolsByProvider.mcp
    const listTools = mcpTools?.find(tool => tool.function.name === 'builtIn_mcpListTools')
    const callTool = mcpTools?.find(tool => tool.function.name === 'builtIn_mcpCallTool')

    expect(mcpTools).toEqual([
      expect.objectContaining({ function: expect.objectContaining({ name: 'builtIn_mcpListTools' }) }),
      expect.objectContaining({ function: expect.objectContaining({ name: 'builtIn_mcpCallTool' }) }),
    ])

    const listResult = await listTools?.execute({}, toolOptions)
    const callResult = await callTool?.execute({
      name: 'filesystem::search',
      arguments: JSON.stringify({ query: 'hello', limit: 10 }),
    }, toolOptions)

    expect(invokeMocks.listMcpTools).toHaveBeenCalledTimes(1)
    expect(invokeMocks.callMcpTool).toHaveBeenCalledWith({
      name: 'filesystem::search',
      arguments: { query: 'hello', limit: 10 },
    })
    expect(listResult).toEqual([{
      serverName: 'filesystem',
      name: 'filesystem::search',
      toolName: 'search',
      description: 'Search files.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    }])
    expect(callResult).toEqual({
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
    })

    store.dispose()

    expect(llmToolsStore.toolsByProvider.mcp).toBeUndefined()
  })

  /**
   * @example
   * mcpStore.sanitizeToolResults = true
   * await vi.waitFor(() => expect(llmToolsStore.toolsByProvider.mcp).not.toBe(previousTools))
   */
  it('refreshes registered MCP tools when sanitize setting changes', async () => {
    const llmToolsStore = useLlmToolsStore()
    const mcpStore = useMcpStore()
    const store = useTamagotchiMcpToolsStore()
    const toolOptions = {} as Parameters<Tool['execute']>[1]

    invokeMocks.callMcpTool.mockResolvedValue({
      content: [{
        type: 'text',
        text: [
          '=====',
          'GLOSSARY',
          '- @alpha -> core://topic',
          'MEMORY: x',
        ].join('\n'),
      }],
      isError: false,
    })

    await store.refresh()

    const rawCallTool = llmToolsStore.toolsByProvider.mcp?.find(tool => tool.function.name === 'builtIn_mcpCallTool')
    const rawResult = await rawCallTool?.execute({
      name: 'filesystem::search',
      arguments: JSON.stringify({ query: 'hello' }),
    }, toolOptions) as { content?: Array<{ text?: string }> } | undefined

    expect(rawResult?.content?.[0]?.text).toContain('=====')

    mcpStore.sanitizeToolResults = true

    await vi.waitFor(() => {
      const refreshedCallTool = llmToolsStore.toolsByProvider.mcp?.find(tool => tool.function.name === 'builtIn_mcpCallTool')
      expect(refreshedCallTool).not.toBe(rawCallTool)
    })

    const sanitizedCallTool = llmToolsStore.toolsByProvider.mcp?.find(tool => tool.function.name === 'builtIn_mcpCallTool')
    const sanitizedResult = await sanitizedCallTool?.execute({
      name: 'filesystem::search',
      arguments: JSON.stringify({ query: 'hello' }),
    }, toolOptions) as { content?: Array<{ text?: string }> } | undefined

    expect(sanitizedResult?.content?.[0]?.text).not.toContain('=====')
    expect(sanitizedResult?.content?.[0]?.text).toContain('GLOSSARY: alpha->topic')

    store.dispose()
  })
})
