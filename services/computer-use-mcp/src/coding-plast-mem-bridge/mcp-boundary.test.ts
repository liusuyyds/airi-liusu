import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { ComputerUseServerRuntime } from '../server/runtime'

import { describe, expect, it, vi } from 'vitest'

import { registerComputerUseTools } from '../server/register-tools'
import { allDescriptors } from '../server/tool-descriptors'
import { RunStateManager } from '../state'
import { createTestConfig } from '../test-fixtures'

function createMockServer() {
  const registeredToolNames: string[] = []

  return {
    server: {
      tool(name: string) {
        registeredToolNames.push(name)
        return { disable: vi.fn() }
      },
    } as unknown as McpServer,
    registeredToolNames,
  }
}

function createRegistrationRuntime() {
  return {
    config: createTestConfig(),
    stateManager: new RunStateManager(),
    session: {},
    executor: {},
    terminalRunner: {},
    browserDomBridge: {},
    cdpBridgeManager: {},
    chromeSessionManager: {},
    desktopSessionController: {},
    taskMemory: {},
  } as unknown as ComputerUseServerRuntime
}

describe('coding plast-mem MCP boundary', () => {
  it('does not expose plast-mem export ingest or retrieval as public MCP descriptors', () => {
    const plastMemDescriptors = allDescriptors.filter(descriptor =>
      /plast[-_ ]?mem|import_batch_messages|context_pre_retrieve|bridge-record/i.test([
        descriptor.canonicalName,
        descriptor.displayName,
        descriptor.summary,
      ].join(' ')),
    )

    expect(plastMemDescriptors).toEqual([])
  })

  it('does not register model-visible plast-mem bridge tools in computer-use MCP', () => {
    const { server, registeredToolNames } = createMockServer()

    registerComputerUseTools({
      server,
      runtime: createRegistrationRuntime(),
      executeAction: vi.fn(),
      enableTestTools: false,
    })

    const plastMemToolNames = registeredToolNames.filter(name =>
      /plast|import.*memory|ingest.*memory|retrieve.*memory|bridge.*memory/i.test(name),
    )

    expect(plastMemToolNames).toEqual([])
  })
})
