/**
 * Smart Ingestor — detects input format and routes to the correct parser.
 *
 * Supports two audit formats from Carleton's uAchieve system:
 *   1. HTML  — saved directly from the browser (contains DOM tags)
 *   2. PDF-text — output of `pdftotext -layout` on the PDF download
 *
 * Detection strategy (in priority order):
 *   a) Explicit format override via the `format` parameter
 *   b) File extension heuristic (.html → HTML, .txt → PDF-text)
 *   c) Content sniffing: presence of "<!DOCTYPE" or "<html" → HTML
 *
 * The router delegates HTML parsing to the cheerio-based parse-html.ts
 * and PDF-text parsing to the state-machine-based parse-pdf.ts.
 */

import type { StudentAuditData, AuditParser } from './types'
import { parseHTML } from './parse-html'
import { parsePDF } from './parse-pdf'
import { isActionableRequirement } from './filter'

export type AuditFormat = 'html' | 'pdf-text'

/**
 * Detect whether raw content is an HTML audit or PDF-extracted text.
 *
 * We only inspect the first 500 characters to keep it fast. HTML audits
 * always begin with a doctype / <html> tag, while pdftotext output starts
 * with plain text (usually the Carleton logo alt text or whitespace).
 */
export function detectFormat(content: string): AuditFormat {
  const head = content.slice(0, 500).trimStart().toLowerCase()

  if (
    head.startsWith('<!doctype') ||
    head.startsWith('<html') ||
    head.includes('<head') ||
    head.includes('<div class="subrequirement"')
  ) {
    return 'html'
  }

  return 'pdf-text'
}

/**
 * Detect format from a file path extension.
 * Returns null if the extension is ambiguous.
 */
export function detectFormatFromPath(filePath: string): AuditFormat | null {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  if (lower.endsWith('.txt')) return 'pdf-text'
  return null
}

// ──────────────────────────────────────────────
// Parser registry
// ──────────────────────────────────────────────

/**
 * Map of format → parser function.
 *
 * HTML: cheerio-based parser (cli/audit/parse-html.ts)
 * PDF-text: state-machine parser (cli/audit/parse-pdf.ts)
 */
const parsers: Record<AuditFormat, AuditParser> = {
  'html': parseHTML,
  'pdf-text': parsePDF,
}

/** Allow a parser to be replaced at runtime for tests. */
export function registerParser(format: AuditFormat, parser: AuditParser): void {
  parsers[format] = parser
}

// ──────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────

export interface IngestOptions {
  /** Override format detection. */
  format?: AuditFormat
  /** File path — used for extension-based detection when format is omitted. */
  filePath?: string
  /**
   * If true, run isActionableRequirement() to strip out non-schedulable
   * requirements (year standing, residency, CGPA rows, zero-credit rows, etc.).
   * Defaults to true.
   */
  filterRequirements?: boolean
}

/**
 * Parse an audit file's content and return normalised StudentAuditData.
 *
 * This is the single entry point that all callers should use.
 *
 * @param content  Raw file content (HTML string or pdftotext output).
 * @param options  Optional hints for format detection and post-processing.
 */
export function ingestAudit(
  content: string,
  options: IngestOptions = {},
): StudentAuditData {
  // 1. Determine format
  const format =
    options.format ??
    (options.filePath ? detectFormatFromPath(options.filePath) : null) ??
    detectFormat(content)

  // 2. Dispatch to the appropriate parser
  const parser = parsers[format]
  const data = parser(content)

  // 3. (Optional) filter out non-actionable requirements
  if (options.filterRequirements !== false) {
    data.requirements = data.requirements.filter(isActionableRequirement)
  }

  return data
}
