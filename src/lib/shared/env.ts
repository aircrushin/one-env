import type { ParsedEnvEntry, Variable } from './types'

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/

function decodeDoubleQuoted(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

function encodeDoubleQuoted(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/"/g, '\\"')
}

function needsQuotes(value: string): boolean {
  return (
    value.length === 0 ||
    value.includes('\n') ||
    /^\s|\s$/.test(value) ||
    /[#"']/.test(value)
  )
}

function stripInlineComment(raw: string): string {
  let escaped = false
  for (let index = 0; index < raw.length; index += 1) {
    const current = raw[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (current === '\\') {
      escaped = true
      continue
    }
    if (current === '#') {
      const previous = index > 0 ? raw[index - 1] : ' '
      if (/\s/.test(previous)) {
        return raw.slice(0, index).trimEnd()
      }
    }
  }
  return raw.trimEnd()
}

function parseQuotedValue(
  initial: string,
  quote: '"' | "'",
  lines: string[],
  startLineIndex: number,
): { value: string; lastLineIndex: number } {
  let content = initial.slice(1)
  let lineIndex = startLineIndex

  while (true) {
    let escape = false
    for (let i = 0; i < content.length; i += 1) {
      const ch = content[i]
      if (quote === '"' && ch === '\\' && !escape) {
        escape = true
        continue
      }
      if (ch === quote && !escape) {
        const inner = content.slice(0, i)
        const value = quote === '"' ? decodeDoubleQuoted(inner) : inner
        return { value, lastLineIndex: lineIndex }
      }
      escape = false
    }

    if (lineIndex + 1 >= lines.length) {
      const value = quote === '"' ? decodeDoubleQuoted(content) : content
      return { value, lastLineIndex: lineIndex }
    }

    lineIndex += 1
    content = `${content}\n${lines[lineIndex]}`
  }
}

export function parseEnvContent(content: string): ParsedEnvEntry[] {
  const entries: ParsedEnvEntry[] = []
  const lines = content.replace(/\r\n/g, '\n').split('\n')

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    if (!line.trim() || /^\s*#/.test(line)) {
      continue
    }

    const matched = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/)
    if (!matched) {
      continue
    }

    const key = matched[1]
    if (!KEY_PATTERN.test(key)) {
      continue
    }

    const rawValue = matched[2] ?? ''

    if (rawValue.startsWith('"') || rawValue.startsWith("'")) {
      const quote = rawValue[0] as '"' | "'"
      const parsed = parseQuotedValue(rawValue, quote, lines, lineIndex)
      entries.push({ key, value: parsed.value })
      lineIndex = parsed.lastLineIndex
      continue
    }

    entries.push({ key, value: stripInlineComment(rawValue).trim() })
  }

  return entries
}

export function serializeEnvEntries(entries: ParsedEnvEntry[]): string {
  const lines = entries.map(({ key, value }) => {
    if (!KEY_PATTERN.test(key)) {
      return ''
    }

    if (!needsQuotes(value)) {
      return `${key}=${value}`
    }

    return `${key}="${encodeDoubleQuoted(value)}"`
  })

  return lines.filter(Boolean).join('\n') + '\n'
}

export function mergeVariablesForExport(
  globalVariables: Variable[],
  envVariables: Variable[],
): Variable[] {
  const merged = new Map<string, Variable>()

  for (const variable of globalVariables) {
    merged.set(variable.key, variable)
  }

  for (const variable of envVariables) {
    merged.set(variable.key, variable)
  }

  return Array.from(merged.values()).sort((a, b) => a.key.localeCompare(b.key))
}
