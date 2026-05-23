import type { ChatHistoryItem } from '../types/chat'

import { describe, expect, it } from 'vitest'

import { cleanupNocturneMemoryContext } from './nocturne-memory'

function assistantWithMcpCall(id: string, qualifiedName: string): ChatHistoryItem {
  return {
    role: 'assistant',
    content: '',
    id: `assistant-${id}`,
    tool_calls: [{
      id,
      type: 'function',
      function: {
        name: 'builtIn_mcpCallTool',
        arguments: JSON.stringify({
          name: qualifiedName,
          arguments: JSON.stringify({ query: 'memory' }),
        }),
      },
    }],
  } as ChatHistoryItem
}

function toolResult(id: string): ChatHistoryItem {
  return {
    role: 'tool',
    tool_call_id: id,
    content: `result for ${id}`,
    id: `tool-${id}`,
  } as ChatHistoryItem
}

describe('cleanupNocturneMemoryContext', () => {
  it('does not prune non-Nocturne MCP tools that share memory tool names', () => {
    /**
     * @example
     * cleanupNocturneMemoryContext([
     *   assistantWithMcpCall('fs-1', 'filesystem::search_memory'),
     * ])
     * // keeps filesystem::search_memory because it is not Nocturne Memory.
     */
    const messages = [
      assistantWithMcpCall('fs-1', 'filesystem::search_memory'),
      toolResult('fs-1'),
      assistantWithMcpCall('fs-2', 'filesystem::search_memory'),
      toolResult('fs-2'),
      assistantWithMcpCall('fs-3', 'filesystem::search_memory'),
      toolResult('fs-3'),
      assistantWithMcpCall('fs-4', 'filesystem::search_memory'),
      toolResult('fs-4'),
    ]

    const cleaned = cleanupNocturneMemoryContext(messages)

    expect(cleaned).toHaveLength(messages.length)
    expect(cleaned.some(message => message.role === 'tool' && (message as { tool_call_id?: string }).tool_call_id === 'fs-1')).toBe(true)
    expect((cleaned[0] as { tool_calls?: unknown[] }).tool_calls).toHaveLength(1)
  })

  it('keeps only the last three Nocturne Memory search calls globally', () => {
    /**
     * @example
     * cleanupNocturneMemoryContext([
     *   assistantWithMcpCall('old', 'nocturne-memory::search_memory'),
     *   assistantWithMcpCall('new', 'nocturne-memory::search_memory'),
     * ])
     * // prunes older Nocturne Memory search calls once the global limit is exceeded.
     */
    const messages = [
      assistantWithMcpCall('nm-1', 'nocturne-memory::search_memory'),
      toolResult('nm-1'),
      assistantWithMcpCall('nm-2', 'nocturne-memory::search_memory'),
      toolResult('nm-2'),
      assistantWithMcpCall('nm-3', 'nocturne-memory::search_memory'),
      toolResult('nm-3'),
      assistantWithMcpCall('nm-4', 'nocturne-memory::search_memory'),
      toolResult('nm-4'),
    ]

    const cleaned = cleanupNocturneMemoryContext(messages)

    expect(cleaned.some(message => message.role === 'tool' && (message as { tool_call_id?: string }).tool_call_id === 'nm-1')).toBe(false)
    expect(cleaned.some(message => message.role === 'tool' && (message as { tool_call_id?: string }).tool_call_id === 'nm-2')).toBe(true)
    expect(cleaned.some(message => message.role === 'tool' && (message as { tool_call_id?: string }).tool_call_id === 'nm-3')).toBe(true)
    expect(cleaned.some(message => message.role === 'tool' && (message as { tool_call_id?: string }).tool_call_id === 'nm-4')).toBe(true)
  })

  it('keeps read_memory results whose content merely discusses the Error concept', () => {
    const messages = [
      {
        role: 'assistant',
        content: '',
        id: 'assistant-read-1',
        tool_calls: [{
          id: 'read-1',
          type: 'function',
          function: {
            name: 'builtIn_mcpCallTool',
            arguments: JSON.stringify({
              name: 'nocturne-memory::read_memory',
              arguments: JSON.stringify({ uri: 'core://agent/error-notes' }),
            }),
          },
        }],
      } as ChatHistoryItem,
      {
        role: 'tool',
        tool_call_id: 'read-1',
        content: 'Error: is the literal term the user asked AIRI to remember.',
        id: 'tool-read-1',
      } as ChatHistoryItem,
    ]

    const cleaned = cleanupNocturneMemoryContext(messages)

    expect(cleaned).toHaveLength(2)
    expect(cleaned.some(message => message.role === 'tool' && (message as { tool_call_id?: string }).tool_call_id === 'read-1')).toBe(true)
  })

  it('prunes JSON-wrapped read_memory errors even when the MCP layer marked the call as successful', () => {
    /**
     * @example
     * cleanupNocturneMemoryContext([
     *   assistantWithMcpCall('read-missing', 'nocturne-memory::read_memory'),
     *   {
     *     role: 'tool',
     *     tool_call_id: 'read-missing',
     *     content: '{"content":[{"type":"text","text":"Error: URI not found."}],"isError":false}',
     *   },
     * ])
     * // prunes the read because Nocturne encodes the domain failure in JSON content.
     */
    const messages = [
      {
        role: 'assistant',
        content: '',
        id: 'assistant-read-missing',
        tool_calls: [{
          id: 'read-missing',
          type: 'function',
          function: {
            name: 'builtIn_mcpCallTool',
            arguments: JSON.stringify({
              name: 'nocturne-memory::read_memory',
              arguments: JSON.stringify({ uri: 'core://missing' }),
            }),
          },
        }],
      } as ChatHistoryItem,
      {
        role: 'tool',
        tool_call_id: 'read-missing',
        content: JSON.stringify({
          content: [{ type: 'text', text: 'Error: URI not found.' }],
          isError: false,
        }),
        id: 'tool-read-missing',
      } as ChatHistoryItem,
    ]

    const cleaned = cleanupNocturneMemoryContext(messages)
    const cleanedAssistant = cleaned[0] as { tool_calls?: unknown[] }

    expect(cleaned).toHaveLength(1)
    expect(cleaned.some(message => message.role === 'tool' && (message as { tool_call_id?: string }).tool_call_id === 'read-missing')).toBe(false)
    expect(cleanedAssistant.tool_calls).toBeUndefined()
  })
})
