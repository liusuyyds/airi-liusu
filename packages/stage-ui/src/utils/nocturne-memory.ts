import type { CommonContentPart, ToolCall } from '@xsai/shared-chat'

import type { ChatHistoryItem, ChatSlices, ChatSlicesToolCall } from '../types/chat'

interface NocturneMemoryCall {
  sliceIndex: number
  toolCallId: string
  toolName: string // 'read_memory' | 'search_memory'
  mcpArgs: Record<string, unknown>
}

interface McpCallToolArgs {
  arguments: string
  name: string
}

function parseMcpCallToolArgs(args: string): McpCallToolArgs | null {
  try {
    const parsed = JSON.parse(args) as unknown
    if (typeof parsed !== 'object' || parsed === null)
      return null
    const obj = parsed as Record<string, unknown>
    if (typeof obj.name !== 'string' || typeof obj.arguments !== 'string')
      return null
    return { name: obj.name, arguments: obj.arguments }
  }
  catch {
    return null
  }
}

/**
 * Extracts the short tool name from the MCP `name` field.
 *
 * Before:
 * - "nocturne-memory::read_memory"
 * - "nocturne_memory::read_memory"
 *
 * After:
 * - "read_memory"
 */
function extractToolName(qualifiedName: string): string {
  const idx = qualifiedName.lastIndexOf('::')
  return idx >= 0 ? qualifiedName.slice(idx + 2) : qualifiedName
}

/**
 * Parses the nested arguments JSON for a Nocturne Memory tool call.
 *
 * The `args` field on `builtIn_mcpCallTool` is itself a JSON string:
 * `{"name":"nocturne::read_memory","arguments":"{\\"uri\\":\\"core://agent\\"}"}`
 *
 * We extract the inner `arguments` field and parse it to get the actual
 * tool parameters (e.g. `{ uri: "core://agent" }`).
 */
function parseMemoryToolArgs(mcpNameArgs: McpCallToolArgs): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(mcpNameArgs.arguments) as unknown
    if (typeof parsed !== 'object' || parsed === null)
      return null
    return parsed as Record<string, unknown>
  }
  catch {
    return null
  }
}

/**
 * Collects Nocturne Memory tool calls from the slices array.
 *
 * Skips:
 * - Non-MCP tool calls (toolName !== 'builtIn_mcpCallTool')
 * - Non-Nocturne-Memory MCP tools (name does not end with '::read_memory'
 *   or '::search_memory')
 * - Tool calls whose args cannot be parsed
 */
function collectNocturneMemoryCalls(slices: ChatSlices[]): NocturneMemoryCall[] {
  const calls: NocturneMemoryCall[] = []

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i]
    if (slice.type !== 'tool-call')
      continue

    const toolCallSlice = slice as ChatSlicesToolCall
    if (toolCallSlice.toolCall.toolName !== 'builtIn_mcpCallTool')
      continue

    const mcpNameArgs = parseMcpCallToolArgs(toolCallSlice.toolCall.args)
    if (!mcpNameArgs)
      continue

    const toolName = extractToolName(mcpNameArgs.name)
    if (toolName !== 'read_memory' && toolName !== 'search_memory')
      continue

    const mcpArgs = parseMemoryToolArgs(mcpNameArgs)
    if (!mcpArgs)
      continue

    calls.push({
      sliceIndex: i,
      toolCallId: toolCallSlice.toolCall.toolCallId,
      toolName,
      mcpArgs,
    })
  }

  return calls
}

function getToolResultContent(
  toolResults: { id: string, isError?: boolean, result?: string | CommonContentPart[] }[],
  toolCallId: string,
): string | undefined {
  const tr = toolResults.find(r => r.id === toolCallId)
  if (!tr || !tr.result)
    return undefined
  if (typeof tr.result === 'string') {
    // NOTICE: xsAI may JSON-stringify the full MCP result object
    // (e.g. {"content":[{"type":"text","text":"Error: ..."}],"isError":false}),
    // so we try to parse and extract the real text payload first.
    const extracted = extractTextFromJsonResult(tr.result)
    if (extracted !== undefined)
      return extracted
    return tr.result
  }
  // result is CommonContentPart[] — extract text from first text part
  const parts = tr.result as { type?: string, text?: string }[]
  const textPart = parts.find(p => p.type === 'text')
  return textPart?.text
}

/**
 * Attempts to extract the text content from a JSON-stringified MCP result.
 *
 * xsAI wraps tool results into the ToolMessage content field, which
 * for structured MCP results becomes a JSON string of the full response
 * object. We try to parse it and extract `content[0].text`.
 *
 * Before:
 * - '{"content":[{"type":"text","text":"Error: URI not found."}],"isError":false}'
 *
 * After:
 * - "Error: URI not found."
 */
function extractTextFromJsonResult(raw: string): string | undefined {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    if (Array.isArray(obj.content)) {
      const parts = obj.content as { type?: string, text?: string }[]
      const textPart = parts.find(p => p.type === 'text')
      if (textPart?.text && typeof textPart.text === 'string')
        return textPart.text
    }
    return undefined
  }
  catch {
    return undefined
  }
}

/**
 * Detects whether a `read_memory` result represents an error.
 *
 * The Nocturne Memory MCP server returns `"Error: <description>"` as a
 * successful MCP call when a domain operation fails (e.g. URI not found),
 * so we check the content string prefix. Also respects `isError`.
 */
function isErrorResult(
  toolResults: { id: string, isError?: boolean, result?: string | CommonContentPart[] }[],
  toolCallId: string,
): boolean {
  const tr = toolResults.find(r => r.id === toolCallId)
  if (!tr)
    return false
  if (tr.isError)
    return true
  const content = getToolResultContent(toolResults, toolCallId)
  if (content && content.trimStart().startsWith('Error:'))
    return true
  return false
}

/**
 * Returns the set of toolCallIds that should be removed from LLM context
 * (but kept in UI display).
 */
export interface NocturneCleanupResult {
  removeToolCallIds: Set<string>
}

/**
 * Identifies redundant or errored Nocturne Memory tool calls for removal
 * from the LLM context of a single assistant turn.
 *
 * Rules:
 * - `read_memory(uri)`: same URI — keep only the LAST call
 * - `read_memory(uri)` with error result: remove entirely
 *
 * Does NOT modify slices or tool_results — those remain intact for UI.
 *
 * @param slices - The building message's slices array (for call scanning only)
 * @param toolResults - The building message's tool_results array
 */
export function cleanupNocturneMemoryResults(
  slices: ChatSlices[],
  toolResults: { id: string, isError?: boolean, result?: string | CommonContentPart[] }[],
): NocturneCleanupResult {
  const calls = collectNocturneMemoryCalls(slices)
  const removeSet = new Set<string>()

  // --- read_memory dedup + error removal ---
  const readCalls = calls.filter(c => c.toolName === 'read_memory')
  const uriLastId = new Map<string, string>()
  for (const call of readCalls) {
    const uri = typeof call.mcpArgs.uri === 'string' ? call.mcpArgs.uri : ''
    uriLastId.set(uri, call.toolCallId)
  }

  for (const call of readCalls) {
    const uri = typeof call.mcpArgs.uri === 'string' ? call.mcpArgs.uri : ''
    const isError = isErrorResult(toolResults, call.toolCallId)
    const isLast = call.toolCallId === uriLastId.get(uri)

    if (isError || !isLast) {
      removeSet.add(call.toolCallId)
    }
  }

  return { removeToolCallIds: removeSet }
}

function hasToolCallsField(msg: ChatHistoryItem): msg is ChatHistoryItem & { role: 'assistant', tool_calls: ToolCall[] } {
  return msg.role === 'assistant' && Array.isArray((msg as unknown as Record<string, unknown>).tool_calls)
}

/**
 * Parses tool call arguments to extract Nocturne Memory URI + tool name.
 * For use on persisted assistant messages' tool_calls array.
 *
 * Returns null for non-Nocturne-Memory calls or unparseable args.
 */
function parseToolCallForContext(tc: ToolCall): { toolCallId: string, toolName: string, uri?: string } | null {
  const func = tc.function
  if (!func || typeof func.name !== 'string' || func.name !== 'builtIn_mcpCallTool')
    return null
  if (typeof func.arguments !== 'string')
    return null

  const mcpNameArgs = parseMcpCallToolArgs(func.arguments)
  if (!mcpNameArgs)
    return null

  const toolName = extractToolName(mcpNameArgs.name)
  if (toolName !== 'read_memory' && toolName !== 'search_memory')
    return null

  const mcpArgs = parseMemoryToolArgs(mcpNameArgs)
  if (!mcpArgs)
    return null

  const uri = typeof mcpArgs.uri === 'string' ? mcpArgs.uri : undefined
  return { toolCallId: tc.id, toolName, uri }
}

/**
 * Scans the full message history and identifies Nocturne Memory tool calls
 * to remove from the LLM context.
 *
 * `read_memory(uri)`: keeps only the LAST occurrence per URI across ALL turns.
 * Previous reads and error results are removed.
 *
 * `search_memory`: keeps only the last 3 across all turns.
 *
 * Returns a new filtered array; originals are not mutated.
 */
export function cleanupNocturneMemoryContext(messages: ChatHistoryItem[]): ChatHistoryItem[] {
  const SEARCH_GLOBAL_LIMIT = 3
  const removeCallIds = new Set<string>()

  // --- read_memory: last per URI wins ---
  const readUriLastId = new Map<string, string>()
  for (const msg of messages) {
    if (!hasToolCallsField(msg))
      continue
    for (const tc of msg.tool_calls) {
      const parsed = parseToolCallForContext(tc)
      if (!parsed || parsed.toolName !== 'read_memory' || !parsed.uri)
        continue
      readUriLastId.set(parsed.uri, parsed.toolCallId)
    }
  }
  for (const msg of messages) {
    if (!hasToolCallsField(msg))
      continue
    for (const tc of msg.tool_calls) {
      const parsed = parseToolCallForContext(tc)
      if (!parsed || parsed.toolName !== 'read_memory' || !parsed.uri)
        continue
      if (parsed.toolCallId !== readUriLastId.get(parsed.uri)) {
        removeCallIds.add(parsed.toolCallId)
      }
    }
  }

  // --- error detection (read_memory) ---
  const errorCallIds = new Set<string>()
  for (const msg of messages) {
    if (msg.role !== 'tool')
      continue
    const tm = msg as { tool_call_id?: string, content?: string }
    if (!tm.tool_call_id || !tm.content)
      continue
    if (tm.content.trimStart().startsWith('Error:')) {
      errorCallIds.add(tm.tool_call_id)
      continue
    }
    const extracted = extractTextFromJsonResult(tm.content)
    if (extracted && extracted.trimStart().startsWith('Error:')) {
      errorCallIds.add(tm.tool_call_id)
    }
  }
  // Remove error reads (read_memory that errored)
  for (const msg of messages) {
    if (!hasToolCallsField(msg))
      continue
    for (const tc of msg.tool_calls) {
      const parsed = parseToolCallForContext(tc)
      if (!parsed || parsed.toolName !== 'read_memory')
        continue
      if (errorCallIds.has(parsed.toolCallId)) {
        removeCallIds.add(parsed.toolCallId)
      }
    }
  }

  // --- search_memory: keep last 6 globally ---
  const allSearchIds: string[] = []
  for (const msg of messages) {
    if (!hasToolCallsField(msg))
      continue
    for (const tc of msg.tool_calls) {
      const parsed = parseToolCallForContext(tc)
      if (!parsed || parsed.toolName !== 'search_memory')
        continue
      allSearchIds.push(parsed.toolCallId)
    }
  }
  const keepSearchIds = new Set(allSearchIds.slice(-SEARCH_GLOBAL_LIMIT))
  for (const id of allSearchIds) {
    if (!keepSearchIds.has(id)) {
      removeCallIds.add(id)
    }
  }

  // --- filter messages ---
  return messages.map((msg) => {
    if (msg.role === 'tool' && (msg as { tool_call_id?: string }).tool_call_id) {
      const toolCallId = (msg as { tool_call_id: string }).tool_call_id
      if (removeCallIds.has(toolCallId))
        return null as unknown as ChatHistoryItem
    }
    if (hasToolCallsField(msg)) {
      const pruned = msg.tool_calls.filter(tc => !removeCallIds.has(tc.id))
      return { ...msg, tool_calls: pruned.length > 0 ? pruned : undefined } as ChatHistoryItem
    }
    return msg
  }).filter(msg => msg !== null) as ChatHistoryItem[]
}
