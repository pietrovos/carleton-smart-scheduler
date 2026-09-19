/**
 * Cheerio-based HTML audit parser.
 *
 * Replaces the regex/string-split logic in cli/audit-parser.ts with
 * proper DOM traversal.  The output conforms to the StudentAuditData
 * interface defined in ./types.ts.
 *
 * Targets the Carleton uAchieve Self-Service HTML audit format — both
 * "save as" browser snapshots (Hakeem_Audit.html, safi-audit.html) and
 * the simplified mock (mock-audit.html).
 */

import * as cheerio from 'cheerio'
import type {
  StudentAuditData,
  RequirementInfo,
  RequirementStatus,
  CompletedCourse,
  CurrentCourse,
} from './types'

// ──────────────────────────────────────────────
// Elective-category detection (same tokens as the legacy parser)
// ──────────────────────────────────────────────

/**
 * Inspect a subrequirement title and return the matching elective
 * category token, or null if it's not an elective row.
 */
function detectElectiveCategory(title: string): string | null {
  const lower = title.toLowerCase()
  if (lower.includes('complementary studies')) return 'COMPLEMENTARY_STUDIES'
  if (lower.includes('computer science elective')) return 'CS_ELECTIVE'
  if (lower.includes('basic science')) return 'SCIENCE_ELECTIVE'
  return null
}

// ──────────────────────────────────────────────
// Header extraction helpers
// ──────────────────────────────────────────────

/**
 * Extract the student name from the auditTitle div.
 *
 * The HTML looks like:
 *   <div class="auditTitle">
 *     <div class="floatright">…</div>
 *     <!--div --> Khan, Hakeem <!-- /div -->
 *     <br/> Bachelor of Engineering - Software Engineering <br/>
 *   </div>
 *
 * The name is a bare text node in "Last, First" format.  We need to
 * grab it, strip child-element text, and flip to "First Last".
 */
function extractNameAndProgram(
  $: cheerio.CheerioAPI,
): { name: string; program: string } {
  const titleDiv = $('div.auditTitle')
  if (titleDiv.length === 0) {
    return { name: '', program: '' }
  }

  // Get the full text, then strip text from child elements (the
  // floatright button, etc.).  The remaining text is on two lines:
  //   "Last, First\nBachelor of Engineering - Something"
  const fullText = titleDiv.text()
  const childText = titleDiv.children().not('br').text()
  const ownText = fullText
    .replace(childText, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Split on "Bachelor of" to separate name from program line
  const bachelorIdx = ownText.indexOf('Bachelor of')
  let rawName = ''
  let rawProgram = ''

  if (bachelorIdx > 0) {
    rawName = ownText.slice(0, bachelorIdx).trim()
    rawProgram = ownText.slice(bachelorIdx).trim()
  } else {
    // Fallback: take the whole thing as name
    rawName = ownText
  }

  // Flip "Last, First" → "First Last"
  let name = rawName
  const commaMatch = rawName.match(/^(.+?),\s*(.+)$/)
  if (commaMatch) {
    name = `${commaMatch[2].trim()} ${commaMatch[1].trim()}`
  }

  // Extract just the program discipline after the dash
  let program = ''
  const dashMatch = rawProgram.match(
    /Bachelor of [\w\s&]+-\s*(.+)/i,
  )
  if (dashMatch) {
    program = cleanProgramName(dashMatch[1])
  }

  return { name, program }
}

/** Strip trailing noise (email addresses, 9-digit IDs) from program text. */
function cleanProgramName(raw: string): string {
  return raw
    .replace(/\bEmail\b.*$/i, '')
    .replace(/\b\d{9}\b.*$/, '')
    .replace(/[a-zA-Z0-9.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9.-]+.*$/, '')
    .trim()
}

/**
 * Find the student ID by locating the "Student ID" label in the audit
 * header and grabbing the value from the adjacent entry div.
 *
 * Falls back to the first 9-digit number in the document.
 */
function extractStudentId($: cheerio.CheerioAPI): string {
  // Strategy 1: Structured header (real audits)
  const labels = $('div.auditHeaderEntryLabel')
  for (let i = 0; i < labels.length; i++) {
    const labelText = $(labels[i]).text().trim()
    if (/student\s*id/i.test(labelText)) {
      const entryDiv = $(labels[i]).next('div.auditHeaderEntry')
      if (entryDiv.length) {
        const id = entryDiv.text().trim()
        if (/^\d{9}$/.test(id)) return id
      }
    }
  }

  // Strategy 2: Fallback — first 9-digit number anywhere in the header
  const headerHtml = $('div.auditHeader').text()
  const idMatch = headerHtml.match(/\b(\d{9})\b/)
  if (idMatch) return idMatch[1]

  // Strategy 3: Absolute fallback — anywhere in the document
  const bodyText = $('body').text()
  const fallback = bodyText.match(/\b(\d{9})\b/)
  return fallback ? fallback[1] : ''
}

// ──────────────────────────────────────────────
// Subrequirement parsing
// ──────────────────────────────────────────────

/**
 * Parse all `div.subrequirement` elements into RequirementInfo objects.
 *
 * Each subrequirement has:
 *   - rqdHours attribute → creditsRequired
 *   - span.status.Status_XX → status
 *   - span.subreqTitle → title (may contain <br/> for line wraps)
 *   - table.subrequirementTotals → creditsCompleted, creditsInProgress
 *   - Course codes extracted from the title text
 */
function extractRequirements(
  $: cheerio.CheerioAPI,
): RequirementInfo[] {
  const requirements: RequirementInfo[] = []

  $('div.subrequirement').each((_i, el) => {
    const $sub = $(el)

    // ── Credits required from attribute ──
    const rqdHoursAttr =
      $sub.attr('rqdHours') ?? $sub.attr('rqdhours') ?? '0'
    const creditsRequired = parseFloat(rqdHoursAttr) || 0

    // ── Status from span.status class ──
    const statusSpan = $sub.find('span.status').first()
    const statusClass = statusSpan.attr('class') || ''
    let status: RequirementStatus = 'NO'
    if (statusClass.includes('Status_OK')) status = 'OK'
    else if (statusClass.includes('Status_IP')) status = 'IP'
    else if (statusClass.includes('Status_NONE')) status = 'NONE'

    // ── Title ──
    const titleSpan = $sub.find('span.subreqTitle').first()
    if (titleSpan.length === 0) return // skip if no title
    // Replace <br/> tags with spaces before extracting text,
    // otherwise cheerio collapses "SYSC 3303,<br/>SYSC 4001" → "SYSC 3303,SYSC 4001"
    titleSpan.find('br').replaceWith(' ')
    const title = titleSpan
      .text()
      .replace(/\s+/g, ' ')
      .trim()

    if (!title) return

    // ── Credits completed ──
    let creditsCompleted = 0
    const totalsTable = $sub.find('table.subrequirementTotals').first()
    // The "cr. Complete" or "Credits" label sits next to the hours span
    const earnedRow = totalsTable.find('tr.subreqEarned').first()
    if (earnedRow.length) {
      const hoursSpan = earnedRow.find('td.bigcolumn span.hours.number').first()
      if (hoursSpan.length) {
        creditsCompleted = parseFloat(hoursSpan.text().trim()) || 0
      }
    }

    // ── Credits in-progress ──
    let creditsInProgress = 0
    const ipRow = totalsTable.find('tr.subreqIpHours').first()
    if (ipRow.length) {
      const ipHours = ipRow.find('td.hours.number').first()
      if (ipHours.length) {
        creditsInProgress = parseFloat(ipHours.text().trim()) || 0
      }
    }

    // ── Course codes from title ──
    // Matches patterns like "SYSC 4907", "COMP 3005", "ELEC 2XXX"
    const coursePattern = /[A-Z]{3,4}\s*(?:\d{4}|\d{1}XXX)/g
    const courseCodes = (title.match(coursePattern) || []).map((c: string) =>
      c.replace(/\s+/g, ''),
    )

    // ── Elective category detection ──
    const electiveCategory = detectElectiveCategory(title)

    // Build courseOptions: concrete codes first, then elective token
    const courseOptions: string[] = [...courseCodes]
    if (electiveCategory && courseCodes.length === 0) {
      courseOptions.push(electiveCategory)
    } else if (electiveCategory) {
      // If both concrete codes AND an elective token, include both
      courseOptions.push(electiveCategory)
    }

    // Only include if there's at least one option
    if (courseOptions.length === 0) return

    requirements.push({
      title: title.substring(0, 100),
      status,
      creditsRequired,
      creditsCompleted,
      creditsInProgress,
      courseOptions,
    })
  })

  return requirements
}

// ──────────────────────────────────────────────
// Course extraction (completed + current)
// ──────────────────────────────────────────────

interface CourseExtractionResult {
  completedCourses: CompletedCourse[]
  currentCourses: CurrentCourse[]
}

/**
 * Walk every `tr.takenCourse` row in the document and split into
 * completed vs. in-progress based on the grade cell.
 *
 * Deduplication: if a course appears multiple times (retakes), we keep
 * the **latest** grade for completed courses (the DOM is ordered
 * chronologically, oldest first).
 */
function extractCourses($: cheerio.CheerioAPI): CourseExtractionResult {
  const completedMap = new Map<string, CompletedCourse>()
  const currentSet = new Set<string>()
  const currentCourses: CurrentCourse[] = []

  $('tr.takenCourse').each((_i, el) => {
    const $row = $(el)
    const term = $row.find('td.term').text().trim()
    const rawCourse = $row.find('td.course').text().trim()
    const grade = $row.find('td.grade').text().trim()

    if (!rawCourse) return

    // Normalise "SYSC 4907" → "SYSC4907"
    const courseId = rawCourse.replace(/\s+/g, '')

    if (grade === 'CUR') {
      if (!currentSet.has(courseId)) {
        currentCourses.push({ courseId, term })
        currentSet.add(courseId)
      }
    } else if (grade && grade !== 'DEF' && grade !== 'UNS' && grade !== 'F' && grade !== 'X' && grade !== 'NR') {
      // Overwrite previous entry if exists (keep latest grade — DOM is chronological)
      completedMap.set(courseId, { courseId, grade })
    }
  })

  return {
    completedCourses: Array.from(completedMap.values()),
    currentCourses,
  }
}

// ──────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────

/**
 * Parse a Carleton uAchieve HTML audit into StudentAuditData.
 *
 * This is the cheerio-based replacement for parseAuditHTML in
 * cli/audit-parser.ts.  It is registered with the router via
 * registerParser('html', parseHTML).
 */
export function parseHTML(content: string): StudentAuditData {
  const $ = cheerio.load(content)

  const { name, program } = extractNameAndProgram($)
  const studentId = extractStudentId($)
  const requirements = extractRequirements($)
  const { completedCourses, currentCourses } = extractCourses($)

  return {
    studentId,
    name,
    program,
    completedCourses,
    currentCourses,
    requirements,
  }
}
