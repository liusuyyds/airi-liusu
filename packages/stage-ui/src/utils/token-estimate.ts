import type { Tool } from '@xsai/shared-chat'

import { getEncoding } from 'js-tiktoken'

// Lazy-load the cl100k_base encoder (used by GPT-4, GPT-4o, Claude 3, etc.).
let _enc: ReturnType<typeof getEncoding> | undefined
function getEncoder() {
  if (!_enc)
    _enc = getEncoding('cl100k_base')
  return _enc
}

/**
 * Returns the exact token count for a plain text string using the
 * cl100k_base BPE tokenizer (OpenAI / Claude compatible).
 */
export function estimateTokens(text: string): number {
  try {
    return getEncoder().encode(text, 'all').length
  }
  catch {
    // Fallback heuristic if tiktoken fails at runtime.
    let count = 0
    for (const char of text) {
      if (/[\u4E00-\u9FFF]/.test(char))
        count += 2
      else if (/[a-z]/i.test(char))
        count += 0.3
      else if (/\s/.test(char))
        count += 0.25
      else count += 0.5
    }
    return Math.max(1, Math.ceil(count))
  }
}

export interface EstimateMessagesTokensOptions {
  /**
   * Tool definitions passed to the model. Can be an array or a function that
   * resolves to an array (matching xsAI's {@link StreamOptions.tools} shape).
   */
  tools?: Tool[] | (() => Promise<Tool[] | undefined>)
  /**
   * Whether the provider supports content-part arrays. When `false`, non-text
   * parts (e.g. images) are dropped and text-only arrays are flattened to
   * strings, matching {@link sanitizeMessages} behavior.
   * @default true
   */
  supportsContentArray?: boolean
}

/**
 * Estimates the total prompt tokens that will be sent to the model.
 *
 * Covers:
 * - Message contents (text + image parts)
 * - Per-message format overhead (role, name, tool_call_id, JSON structure)
 * - tool_calls inside assistant messages
 * - Tool definitions (functions)
 * - Runtime sanitizeMessages transforms (error → user rewrite, array flattening)
 *
 * Use when:
 * - Showing a pre-send token count so the user knows how large the context is.
 *
 * Expects:
 * - `messages` are the raw messages composed by the chat store (before
 *   {@link sanitizeMessages} runs).
 * - `options.tools` matches the tools actually passed to `streamText`.
 *
 * Returns:
 * - A heuristic token total; within ~10-20 % of the provider's true count for
 *   text-heavy prompts. Image tokens are coarse-grained approximations.
 */
export async function estimateMessagesTokens(
  messages: Array<{ content?: unknown, role?: string, name?: string, tool_calls?: unknown, tool_call_id?: string }>,
  options?: EstimateMessagesTokensOptions,
): Promise<number> {
  let total = 0

  // Resolve tools if a function was passed.
  const tools = typeof options?.tools === 'function'
    ? (await options.tools()) ?? []
    : options?.tools

  // Simulate sanitizeMessages transforms so we count what actually goes on the wire.
  const sanitized = messages.map((msg: any) => {
    if (msg && msg.role === 'error') {
      return {
        role: 'user',
        content: `User encountered error: ${String(msg.content ?? '')}`,
      }
    }

    if (msg && Array.isArray(msg.content)) {
      const contentParts = msg.content as { type?: string, text?: string }[]
      const hasNonTextPart = contentParts.some(part => part?.type && part.type !== 'text')
      if (options?.supportsContentArray === false || !hasNonTextPart) {
        return { ...msg, content: contentParts.map(part => part?.text ?? '').join('') }
      }
    }

    return msg
  })

  for (const msg of sanitized) {
    // Per-message JSON/format overhead (role, content key, braces, etc.).
    total += 4

    if (msg.role)
      total += estimateTokens(msg.role)
    if (msg.name)
      total += estimateTokens(msg.name)
    if (msg.tool_call_id)
      total += estimateTokens(msg.tool_call_id)

    if (typeof msg.content === 'string') {
      total += estimateTokens(msg.content)
    }
    else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part && typeof part === 'object') {
          if ('type' in part && part.type === 'text' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
            total += estimateTokens((part as { text: string }).text)
          }
          else if ('type' in part && (part.type === 'image_url' || part.type === 'image')) {
            total += estimateImageTokens(part as { image_url?: { url?: string, detail?: string } })
          }
        }
      }
    }

    // tool_calls inside assistant messages.
    if (Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        total += 4 // per-tool-call overhead
        if (tc && typeof tc === 'object') {
          if ('id' in tc && typeof tc.id === 'string')
            total += estimateTokens(tc.id)
          if ('type' in tc && tc.type === 'function') {
            const fn = (tc as any).function
            if (fn?.name)
              total += estimateTokens(fn.name)
            if (fn?.arguments)
              total += estimateTokens(String(fn.arguments))
          }
        }
      }
    }
  }

  // Tool definitions.
  if (tools) {
    for (const tool of tools) {
      total += 4 // per-tool overhead
      if (tool.function?.name)
        total += estimateTokens(tool.function.name)
      if (tool.function?.description)
        total += estimateTokens(tool.function.description)
      if (tool.function?.parameters)
        total += estimateTokens(JSON.stringify(tool.function.parameters))
    }
  }

  return total
}

/**
 * Coarse-grained vision token estimator.
 *
 * OpenAI vision pricing:
 * - low detail  → 85 tokens flat
 * - high detail → 85 base + 170 per 512×512 tile
 *
 * We don't have the image dimensions at estimate time, so we use heuristics.
 */
function estimateImageTokens(part: { image_url?: { url?: string, detail?: string } }): number {
  const detail = part.image_url?.detail ?? 'auto'

  if (detail === 'low')
    return 85
  if (detail === 'high') {
    // Assume a 2×2 tile grid (1024×1024-ish) when we can't inspect the image.
    return 85 + 170 * 4
  }

  // 'auto' — use a middle-ground guess.
  return 200
}

/**
 * Estimates tokens for a raw message array by JSON-stringifying it and
 * counting tokens on the resulting payload.
 *
 * This is the closest synchronous approximation to the actual request body
 * size. It includes JSON structure overhead (role, content keys, braces,
 * quotes, commas) as well as nested fields like tool_calls and
 * tool_call_id.
 *
 * Use when:
 * - You need a quick token count of the exact messages that will be sent.
 *
 * Expects:
 * - `messages` are plain objects (Vue Proxies should be stripped by the
 *   caller via `toRaw` or `JSON.parse(JSON.stringify(...))`).
 *
 * Returns:
 * - Token count of `JSON.stringify(messages)`.
 */
export function estimateMessageArrayTokens(messages: unknown[]): number {
  const plain = JSON.parse(JSON.stringify(messages))
  return estimateTokens(JSON.stringify(plain))
}

export function formatTokenCount(count: number): string {
  if (count >= 1_000_000)
    return `${(count / 1_000_000).toFixed(1)}m`
  if (count >= 1000)
    return `${(count / 1000).toFixed(1)}k`
  return String(count)
}
