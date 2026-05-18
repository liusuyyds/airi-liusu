import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { useMcpStore } from '@proj-airi/stage-ui/stores/mcp'
import { createMcpTools } from '@proj-airi/stage-ui/tools/mcp'
import { defineStore } from 'pinia'
import { watch } from 'vue'

import { electronMcpCallTool, electronMcpListTools } from '../../shared/eventa'

/**
 * Registers Electron-backed MCP tools into the shared LLM tools store.
 *
 * Use when:
 * - The Tamagotchi renderer needs live MCP tools during chat streaming
 *
 * Expects:
 * - Electron Eventa handlers for MCP listing and invocation are available
 *
 * Returns:
 * - Store actions for refreshing and disposing MCP runtime tools
 */
export const useTamagotchiMcpToolsStore = defineStore('tamagotchi-mcp-tools', () => {
  const llmToolsStore = useLlmToolsStore()
  const mcpStore = useMcpStore()
  const listMcpTools = useElectronEventaInvoke(electronMcpListTools)
  const callMcpTool = useElectronEventaInvoke(electronMcpCallTool)
  let registered = false

  async function refresh() {
    registered = true
    return llmToolsStore.registerTools('mcp', Promise.all(createMcpTools({
      listTools: () => listMcpTools(),
      callTool: payload => callMcpTool(payload),
    }, { sanitizeToolResults: mcpStore.sanitizeToolResults })))
  }

  watch(() => mcpStore.sanitizeToolResults, () => {
    if (!registered)
      return

    void refresh().catch((error) => {
      console.warn('[mcp-tools] Failed to refresh MCP runtime tools:', error)
    })
  })

  function dispose() {
    registered = false
    llmToolsStore.clearTools('mcp')
  }

  return {
    dispose,
    refresh,
  }
})
