import type { ChatHistoryItem } from '../types/chat'

/**
 * Removes a message and any associated tool result messages that follow it.
 *
 * When an assistant message with `tool_calls` is deleted, the subsequent
 * `tool` role messages whose `tool_call_id` matches any of the deleted
 * message's tool call IDs are also removed. This prevents orphaned tool
 * results from lingering in the LLM context.
 *
 * Before:
 * - assistant (tool_calls: [{id: "tc1"}, {id: "tc2"}])
 * - tool (tool_call_id: "tc1")
 * - tool (tool_call_id: "tc2")
 * - user ("next message")
 *
 * After deleting the assistant message at index 0:
 * - user ("next message")
 *
 * @param messages - The full session message array
 * @param index - The index of the message to remove
 * @returns A new array with the target message and its associated tool messages removed
 */
export function deleteMessageWithToolCascade(messages: ChatHistoryItem[], index: number): ChatHistoryItem[] {
  const target = messages[index]
  if (!target)
    return messages

  // Collect tool_call IDs from the assistant message being deleted
  const toolCallIds = new Set<string>()
  if (target.role === 'assistant' && Array.isArray(target.tool_calls)) {
    for (const tc of target.tool_calls) {
      if (tc.id)
        toolCallIds.add(tc.id)
    }
  }

  return messages.filter((message, i) => {
    // Always remove the target message
    if (i === index)
      return false
    // Remove tool messages that belong to the deleted assistant message
    if (message.role === 'tool' && message.tool_call_id && toolCallIds.has(message.tool_call_id))
      return false
    return true
  })
}
