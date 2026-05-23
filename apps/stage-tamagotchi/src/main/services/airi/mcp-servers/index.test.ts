import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
  getVersion: vi.fn(),
}))

const shellMock = vi.hoisted(() => ({
  showItemInFolder: vi.fn(),
}))

const clientMocks = vi.hoisted(() => ({
  close: vi.fn(),
  connect: vi.fn(),
  listTools: vi.fn(),
}))

vi.mock('electron', () => ({
  app: appMock,
  shell: shellMock,
}))

vi.mock('@guiiai/logg', () => ({
  useLogg: vi.fn(() => ({
    useGlobalConfig: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      withError: vi.fn(() => ({ warn: vi.fn() })),
      withFields: vi.fn(() => ({ debug: vi.fn(), warn: vi.fn() })),
    }),
  })),
}))

vi.mock('../../../libs/bootkit/lifecycle', () => ({
  onAppBeforeQuit: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    close = clientMocks.close
    connect = clientMocks.connect
    listTools = clientMocks.listTools
  },
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', async () => {
  const { PassThrough } = await import('node:stream')

  return {
    StdioClientTransport: class {
      stderr = new PassThrough()

      constructor(readonly server: unknown) {}

      close = vi.fn(async () => undefined)
    },
  }
})

describe('createMcpStdioManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.AIRI_COMPUTER_USE_MCP_RUNNER
    delete process.env.AIRI_LOCAL_PLAST_MEM_DEV
    appMock.getPath.mockReturnValue('/tmp/airi-user-data')
    appMock.getVersion.mockReturnValue('0.10.0')
    clientMocks.close.mockResolvedValue(undefined)
    clientMocks.connect.mockResolvedValue(undefined)
    clientMocks.listTools.mockResolvedValue({ tools: [] })
  })

  it('includes stderr captured during connect failures in MCP server test results', async () => {
    const { createMcpStdioManager } = await import('./index')
    const manager = createMcpStdioManager()

    clientMocks.connect.mockImplementationOnce(async (transport: { stderr: NodeJS.WritableStream }) => {
      transport.stderr.write('Missing required environment variable: API_KEY\n')
      throw new Error('connect failed')
    })

    const result = await manager.testServer({
      name: 'broken-server',
      config: {
        command: 'broken-mcp-server',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('connect failed')
    expect(result.error).toContain('Missing required environment variable: API_KEY')
  })

  it('auto-registers packaged computer_use MCP when its runner exists', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'airi-packaged-computer-use-mcp-'))
    const userDataDir = join(tempRoot, 'user-data')
    const runnerPath = join(tempRoot, 'resources', 'computer-use-mcp', 'bin', 'run.mjs')
    await mkdir(join(tempRoot, 'resources', 'computer-use-mcp', 'bin'), { recursive: true })
    await mkdir(userDataDir, { recursive: true })
    await writeFile(runnerPath, 'export {}\n')

    process.env.AIRI_COMPUTER_USE_MCP_RUNNER = runnerPath
    appMock.getPath.mockReturnValue(userDataDir)

    const { createMcpStdioManager } = await import('./index')
    const manager = createMcpStdioManager()
    const result = await manager.applyAndRestart()
    const status = manager.getRuntimeStatus().servers.find(server => server.name === 'computer_use')

    expect(result.started).toEqual([{ name: 'computer_use' }])
    expect(status?.state).toBe('running')
    expect(status?.command).toBe(process.execPath)
    expect(status?.args).toEqual([runnerPath])
  })
})
