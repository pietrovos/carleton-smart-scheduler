/**
 * Line-by-line state-machine PDF-text audit parser.
 *
 * Replaces the regex-based extractRequirementsFromPDF + parseAuditPDF
 * from cli/audit-parser.ts.  Reads pdftotext -layout output and produces
 * the same StudentAuditData interface.
 *
 * The PDF text has a predictable structure:
 *   Line 1:  "Prepared: MM/DD/YY …           STUDENT_ID"
 *   Line 2:  "Last, First"
 *   Line 3:  "PROGRAM CODE: BENG-8P …"
 *   Line 4:  "              Bachelor of Engineering - Software Engineering"
 *   ...
 *   Subrequirements:
 *     "     +    N) CREDITS credits in/from TITLE_TEXT"
 *     "                  X.XX cr. Complete"
 *     "           IP                Y.YY Credits"
 *     "          Term   Course    Credits   Grade   Title"
 *     "          21FA   SYSC 4907    0.50   A+"
 */

import type {
  StudentAuditData,
  RequirementInfo,
  RequirementStatus,
  CompletedCourse,
  CurrentCourse,
} from './types'

// ──────────────────────────────────────────────
// Elective-category detection (shared with parse-html)
// ──────────────────────────────────────────────

function detectElectiveCategory(title: string): string | null {
  const lower = title.toLowerCase()
  if (lower.includes('complementary studies')) return 'COMPLEMENTARY_STUDIES'
  if (lower.includes('computer science elective')) return 'CS_ELECTIVE'
  if (lower.includes('basic science')) return 'SCIENCE_ELECTIVE'
  return null
}

function cleanProgramName(raw: string): string {
  return raw
    .replace(/\bEmail\b.*$/i, '')
    .replace(/\b\d{9}\b.*$/, '')
    .replace(/[a-zA-Z0-9.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9.-]+.*$/, '')
    .trim()
}

// ──────────────────────────────────────────────
// Header extraction
// ──────────────────────────────────────────────

interface HeaderInfo {
  studentId: string
  name: string
  program: string
}

function extractHeader(lines: string[]): HeaderInfo {
  let studentId = ''
  let name = ''
  let program = ''

  // Line 1: "Prepared: ...          101000001"
  // Student ID is the 9-digit number, typically at the end of line 1
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const idMatch = lines[i].match(/\b(\d{9})\b/)
    if (idMatch) {
      studentId = idMatch[1]
      break
    }
  }

  // Line 2: "Last, First" or "Last, First Middle"
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const nameMatch = lines[i].match(/^\s*([A-Z][a-zA-Z'-]+),\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)*)/)
    if (nameMatch) {
      name = `${nameMatch[2].trim()} ${nameMatch[1].trim()}`
      break
    }
  }

  // Lines 3-6: "Bachelor of Engineering - Software Engineering"
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const progMatch = lines[i].match(/Bachelor of [\w\s&]+-\s*(.+)/i)
    if (progMatch) {
      program = cleanProgramName(progMatch[1])
      break
    }
    // BIT programs: "BIT: Network Technology"
    const bitMatch = lines[i].match(/BIT:\s*(.+)/i)
    if (bitMatch) {
      program = cleanProgramName(bitMatch[1])
      break
    }
  }

  return { studentId, name, program }
}

// ──────────────────────────────────────────────
// Requirement + course extraction (state machine)
// ──────────────────────────────────────────────

// Regex: matches "N) CREDITS credits in/from TITLE" or "N) TITLE (no credits prefix)"
const SUBREQ_START = /^\s*(?:IP\s+)?[+\-*]\s+(\d+)\)\s+([\d.]+)\s+credits?\s+(?:in|from)\s+(.*)/i
// Also handle: "N) TITLE" where TITLE starts with a course code or keyword (e.g. "CCDP 2100 (formerly...)")
const SUBREQ_START_ALT = /^\s*(?:IP\s+)?[+\-*]\s+(\d+)\)\s+(.*)/

// Continuation lines for multi-line titles (indented, no course data)
const TITLE_CONTINUATION = /^\s{10,}([A-Z][A-Za-z].*)/

// Course line: "21FA   SYSC 4907    0.50   A+"
const COURSE_LINE = /^\s*(\d{2}(?:FA|WN|SU))\s+([A-Z]{3,4})\s+(\d{4})\s+([\d.]+)\s+(\S+)/

// Credits completed: "X.XX cr. Complete"
const CR_COMPLETE = /([\d.]+)\s+cr\.\s+Complete/

// IP credits: "IP    X.XX Credits"
const IP_CREDITS = /IP\s+([\d.]+)\s+Credits?/i

// NEEDS line
const NEEDS_LINE = /NEEDS:/

// Page break
const PAGE_BREAK = /Page\s+\d+\s+of\s+\d+/

// Section headers (requirement-level, not subrequirements)
const SECTION_HEADER = /^\s*(?:OK|IP|NO)?\s{2,}(FIRST YEAR|SECOND YEAR|THIRD YEAR|FOURTH YEAR|COMPLEMENTARY|CO-OP|COURSES SET ASIDE)/i

// End of audit
const END_OF_REPORT = /\*+\s*END OF REPORT\s*\*+/i
const END_OF_AUDIT = /^\s*Legend$/

// "Courses set aside" section — stop parsing requirements
const COURSES_SET_ASIDE = /COURSES SET ASIDE/i

interface ParseState {
  requirements: RequirementInfo[]
  completedCourses: Map<string, CompletedCourse>
  currentCourses: Map<string, CurrentCourse>
  // Current subrequirement being built
  currentReq: {
    title: string
    creditsRequired: number
    creditsCompleted: number
    creditsInProgress: number
    hasNeeds: boolean
  } | null
  inSetAside: boolean
}

function flushRequirement(state: ParseState): void {
  const req = state.currentReq
  if (!req) return
  state.currentReq = null

  const title = req.title.replace(/\s+/g, ' ').trim()
  if (!title) return

  // Extract course codes from title
  const coursePattern = /[A-Z]{3,4}\s*(?:\d{4}|\d{1}XXX)/g
  const courseCodes = (title.match(coursePattern) || []).map((c: string) =>
    c.replace(/\s+/g, ''),
  )

  // Detect elective category
  const electiveCategory = detectElectiveCategory(title)

  const courseOptions: string[] = [...courseCodes]
  if (electiveCategory && courseCodes.length === 0) {
    courseOptions.push(electiveCategory)
  } else if (electiveCategory) {
    courseOptions.push(electiveCategory)
  }

  if (courseOptions.length === 0) return

  // Determine status
  let status: RequirementStatus = 'NO'
  if (req.hasNeeds) {
    status = req.creditsInProgress > 0 ? 'IP' : 'NO'
  } else if (req.creditsCompleted >= req.creditsRequired) {
    status = 'OK'
  } else if (req.creditsCompleted + req.creditsInProgress >= req.creditsRequired) {
    status = 'IP'
  }

  state.requirements.push({
    title: title.substring(0, 100),
    status,
    creditsRequired: req.creditsRequired,
    creditsCompleted: req.creditsCompleted,
    creditsInProgress: req.creditsInProgress,
    courseOptions,
  })
}

function processCourse(
  state: ParseState,
  term: string,
  courseId: string,
  grade: string,
  fullLine: string,
): void {
  const isCurrent =
    grade === 'CUR' ||
    grade === 'DEF' ||
    fullLine.includes(' CUR') ||
    fullLine.includes(' DEF')

  // Don't count courses from the "set aside" section as completed/current
  if (state.inSetAside) return

  if (isCurrent) {
    if (!state.currentCourses.has(courseId)) {
      state.currentCourses.set(courseId, { courseId, term })
    }
  } else if (
    grade &&
    grade !== 'UNS' &&
    grade !== 'F' &&
    grade !== 'X' &&
    grade !== 'NR'
  ) {
    // PDF is chronological — later entry overwrites (keeps latest grade)
    state.completedCourses.set(courseId, { courseId, grade })
  }
}

// ──────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────

export function parsePDF(content: string): StudentAuditData {
  const lines = content.split(/\r?\n/)
  const { studentId, name, program } = extractHeader(lines)

  const state: ParseState = {
    requirements: [],
    completedCourses: new Map(),
    currentCourses: new Map(),
    currentReq: null,
    inSetAside: false,
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Stop at end of report
    if (END_OF_REPORT.test(line) || END_OF_AUDIT.test(line)) {
      flushRequirement(state)
      break
    }

    // Skip page breaks
    if (PAGE_BREAK.test(line)) continue

    // Detect "Courses set aside" — stop counting courses as real
    if (COURSES_SET_ASIDE.test(line)) {
      flushRequirement(state)
      state.inSetAside = true
      continue
    }

    // Section headers reset inSetAside if we hit a new real section
    if (SECTION_HEADER.test(line) && !COURSES_SET_ASIDE.test(line)) {
      flushRequirement(state)
      state.inSetAside = false
      continue
    }

    // Try to match a subrequirement start
    const subreqMatch = line.match(SUBREQ_START)
    if (subreqMatch) {
      flushRequirement(state)
      state.inSetAside = false
      state.currentReq = {
        title: subreqMatch[3].trim(),
        creditsRequired: parseFloat(subreqMatch[2]) || 0,
        creditsCompleted: 0,
        creditsInProgress: 0,
        hasNeeds: false,
      }
      continue
    }

    // Alt subreq: "N) CCDP 2100 (formerly ALSS 1000)" — no "credits in"
    const altMatch = line.match(SUBREQ_START_ALT)
    if (altMatch && !subreqMatch) {
      const titleText = altMatch[2].trim()
      // Only treat as subreq if title contains a course code or known keyword
      if (/[A-Z]{3,4}\s+\d{4}/.test(titleText) || /complementary|elective|science|ecor|sysc/i.test(titleText)) {
        flushRequirement(state)
        state.inSetAside = false
        state.currentReq = {
          title: titleText,
          creditsRequired: 0,
          creditsCompleted: 0,
          creditsInProgress: 0,
          hasNeeds: false,
        }
        continue
      }
    }

    // If we're building a requirement, look for continuation/metadata
    if (state.currentReq) {
      // Credits completed
      const crMatch = line.match(CR_COMPLETE)
      if (crMatch) {
        state.currentReq.creditsCompleted = parseFloat(crMatch[1]) || 0
        continue
      }

      // IP credits
      const ipMatch = line.match(IP_CREDITS)
      if (ipMatch) {
        state.currentReq.creditsInProgress = parseFloat(ipMatch[1]) || 0
        continue
      }

      // NEEDS line
      if (NEEDS_LINE.test(line)) {
        state.currentReq.hasNeeds = true
        continue
      }

      // Title continuation (indented text that's part of the title)
      // Only if we haven't seen cr. Complete yet (still in title area)
      if (state.currentReq.creditsCompleted === 0 && state.currentReq.creditsInProgress === 0) {
        const contMatch = line.match(TITLE_CONTINUATION)
        if (contMatch && !/Term\s+Course/.test(line) && !CR_COMPLETE.test(line)) {
          state.currentReq.title += ' ' + contMatch[1].trim()
          continue
        }
      }
    }

    // Course line (applies whether or not we're in a requirement)
    const courseMatch = line.match(COURSE_LINE)
    if (courseMatch) {
      const term = courseMatch[1]
      const courseId = courseMatch[2] + courseMatch[3]
      const grade = courseMatch[5]
      processCourse(state, term, courseId, grade, line)
      continue
    }
  }

  // Flush last requirement
  flushRequirement(state)

  return {
    studentId,
    name,
    program,
    completedCourses: Array.from(state.completedCourses.values()),
    currentCourses: Array.from(state.currentCourses.values()),
    requirements: state.requirements,
  }
}
