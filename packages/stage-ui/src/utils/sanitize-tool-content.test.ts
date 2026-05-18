import { describe, expect, it } from 'vitest'

import { sanitizeToolContent } from './sanitize-tool-content'

describe('sanitizeToolContent', () => {
  it('compresses glossary entries without regex backtracking-sensitive parsing', () => {
    /**
     * @example
     * sanitizeToolContent('GLOSSARY\n- @alpha, @beta -> core://topic\nMEMORY: x')
     * // -> 'GLOSSARY: alpha/beta->topic\nMEMORY: x'
     */
    const sanitized = sanitizeToolContent([
      '=====',
      'GLOSSARY',
      '- @alpha, @beta -> core://topic',
      'MEMORY: x',
      'content',
    ].join('\n'))

    expect(sanitized).not.toContain('=====')
    expect(sanitized).toContain('GLOSSARY: alpha/beta->topic')
    expect(sanitized).toContain('MEMORY: x')
  })
})
