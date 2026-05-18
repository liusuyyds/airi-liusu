/**
 * Sanitizes verbose tool result content by stripping decorative boilerplate
 * while keeping the primary semantic payload intact.
 *
 * Targets the output format of the Nocturne Memory MCP server:
 * - Removes `====` / `---` separator lines (pure decoration).
 * - Compresses the `GLOSSARY` block into a single compact line.
 * - In CHILD MEMORIES, drops the `Snippet:` and `When to recall:` detail lines,
 *   keeping only the URI and Priority for navigation.
 *
 * The memory `content` itself is NEVER truncated — it is preserved in full.
 */
export function sanitizeToolContent(content: string): string {
  const lines = content.split('\n')
  const out: string[] = []
  let inChildMemories = false
  let glossaryEntries: string[] = []
  let inGlossaryBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Skip decorative separator lines
    if (/^={3,}$/.test(trimmed) || /^-{3,}$/.test(trimmed))
      continue

    // Collect GLOSSARY entries to compress into one line later
    if (trimmed.startsWith('GLOSSARY')) {
      inGlossaryBlock = true
      continue
    }
    if (inGlossaryBlock) {
      // Exit when we hit a line that clearly belongs to another section
      if (trimmed.startsWith('CHILD MEMORIES') || trimmed.startsWith('MEMORY:') || trimmed.startsWith('# ')) {
        inGlossaryBlock = false
      }
      else if (trimmed.startsWith('- @')) {
        // "- @keyword -> URI" -> "keyword->URI" (strip core:// to save tokens)
        const arrowIndex = trimmed.indexOf('->')
        if (arrowIndex > 3) {
          const keyword = trimmed.slice(3, arrowIndex).trim().replace(/,\s*@/g, '/').replace(/@/g, '')
          const uri = trimmed.slice(arrowIndex + 2).trim().replace(/^core:\/\//, '')
          glossaryEntries.push(`${keyword}->${uri}`)
        }
        continue
      }
      else {
        continue
      }
    }

    // Flush compressed glossary before we leave the block area
    if (!inGlossaryBlock && glossaryEntries.length > 0) {
      out.push(`GLOSSARY: ${glossaryEntries.join(', ')}`)
      glossaryEntries = []
    }

    // Enter CHILD MEMORIES block — persists across blank lines between entries
    if (trimmed.startsWith('CHILD MEMORIES')) {
      inChildMemories = true
      out.push(line)
      continue
    }
    if (inChildMemories) {
      // Exit when a new top-level memory or section starts
      if (trimmed.startsWith('MEMORY:') || trimmed.startsWith('# ')) {
        inChildMemories = false
      }
      else if (trimmed.startsWith('Snippet:') || trimmed.startsWith('When to recall:')) {
        continue
      }
      else {
        out.push(line)
        continue
      }
    }

    out.push(line)
  }

  // Flush any remaining glossary at EOF
  if (glossaryEntries.length > 0) {
    out.push(`GLOSSARY: ${glossaryEntries.join(', ')}`)
  }

  return out.join('\n')
}
