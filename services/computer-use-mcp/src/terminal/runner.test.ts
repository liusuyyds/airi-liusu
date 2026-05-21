import { tmpdir } from 'node:os'
import { execPath } from 'node:process'

import { describe, expect, it } from 'vitest'

import { createTestConfig } from '../test-fixtures'
import { createLocalShellRunner, TERMINAL_OUTPUT_MAX_CHARS } from './runner'

const testShell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash'
const testCwd = process.platform === 'win32' ? tmpdir() : '/tmp'
const printCwdCommand = process.platform === 'win32' ? '$PWD.Path' : 'pwd'

function nodeEvalCommand(script: string): string {
  const node = JSON.stringify(execPath)
  const source = JSON.stringify(script)

  return process.platform === 'win32'
    ? `& ${node} -e ${source}`
    : `${node} -e ${source}`
}

describe('createLocalShellRunner', () => {
  it('executes commands and keeps cwd sticky across calls', async () => {
    const runner = createLocalShellRunner(createTestConfig({
      terminalShell: testShell,
    }))

    const first = await runner.execute({
      command: printCwdCommand,
      cwd: testCwd,
    })
    const second = await runner.execute({
      command: printCwdCommand,
    })

    expect(first.exitCode).toBe(0)
    expect(first.effectiveCwd).toBe(testCwd)
    expect(first.stdout.trim().toLowerCase()).toContain(testCwd.toLowerCase())
    expect(second.effectiveCwd).toBe(testCwd)
    expect(runner.getState().effectiveCwd).toBe(testCwd)
  })

  it('returns non-zero exit codes without throwing', async () => {
    const runner = createLocalShellRunner(createTestConfig({
      terminalShell: testShell,
    }))
    const result = await runner.execute({
      command: 'exit 7',
    })

    expect(result.exitCode).toBe(7)
    expect(runner.getState().lastExitCode).toBe(7)
  })

  it('bounds captured stdout and stderr for large command output', async () => {
    const runner = createLocalShellRunner(createTestConfig({
      terminalShell: testShell,
    }))
    const result = await runner.execute({
      command: nodeEvalCommand('process.stdout.write(\'o\'.repeat(20000)); process.stderr.write(\'e\'.repeat(20000))'),
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toHaveLength(TERMINAL_OUTPUT_MAX_CHARS)
    expect(result.stderr).toHaveLength(TERMINAL_OUTPUT_MAX_CHARS)
    expect(result.stdoutTruncated).toBe(true)
    expect(result.stderrTruncated).toBe(true)
    expect(result.stdoutOriginalLength).toBe(20_000)
    expect(result.stderrOriginalLength).toBe(20_000)
  })

  it('resets the tracked state', async () => {
    const runner = createLocalShellRunner(createTestConfig({
      terminalShell: testShell,
    }))
    await runner.execute({
      command: printCwdCommand,
      cwd: testCwd,
    })

    const reset = runner.resetState('test reset')
    expect(reset.effectiveCwd).toBe(process.cwd())
    expect(reset.lastExitCode).toBeUndefined()
    expect(reset.lastCommandSummary).toBeUndefined()
  })
})
