/**
 * Shared types for the Degree Audit Parser.
 *
 * Both the HTML (cheerio) parser and the PDF (state-machine) parser
 * must produce output that conforms to these interfaces.  Downstream
 * consumers (getRemainingCourses, getElectiveRequirements, the /api/audit
 * routes, and the CLI) all depend on this single contract.
 */

// ──────────────────────────────────────────────
// Requirement-level types
// ──────────────────────────────────────────────

/** Status of a single sub-requirement row in the audit. */
export type RequirementStatus = 'OK' | 'NO' | 'IP' | 'NONE'

export interface RequirementInfo {
  /** Human-readable title, truncated to 100 chars (e.g. "4.0 credits in SYSC 4001, SYSC 4005 ..."). */
  title: string
  status: RequirementStatus
  /** Total credits the sub-requirement demands. */
  creditsRequired: number
  /** Credits already earned toward this sub-requirement. */
  creditsCompleted: number
  /** Credits currently in-progress toward this sub-requirement. */
  creditsInProgress: number
  /**
   * Concrete course codes (e.g. "SYSC4001") OR elective category tokens
   * (e.g. "CS_ELECTIVE", "COMPLEMENTARY_STUDIES") extracted from the title.
   *
   * Elective tokens are expanded later by elective-mappings.ts.
   */
  courseOptions: string[]
}

// ──────────────────────────────────────────────
// Student-level types
// ──────────────────────────────────────────────

export interface CompletedCourse {
  courseId: string   // e.g. "SYSC4001"
  grade: string      // e.g. "A+", "B-", "CUR" is never here
}

export interface CurrentCourse {
  courseId: string   // e.g. "SYSC4907"
  term: string       // e.g. "25WN" (from HTML) or "202510" style depending on source
}

/**
 * The canonical output of both parsers.
 *
 * Every field must be populated identically regardless of whether the
 * input was an HTML file or a PDF-to-text file.
 */
export interface StudentAuditData {
  studentId: string                 // 9-digit Carleton student ID
  name: string                      // "Firstname Lastname"
  program: string                   // e.g. "Software Engineering"
  completedCourses: CompletedCourse[]
  currentCourses: CurrentCourse[]
  requirements: RequirementInfo[]
}

// ──────────────────────────────────────────────
// Elective requirement (computed, not parsed)
// ──────────────────────────────────────────────

export interface ElectiveRequirement {
  category: string        // e.g. "CS_ELECTIVE", "SCIENCE_ELECTIVE"
  label: string           // Human-readable, e.g. "Computer Science Elective"
  creditsNeeded: number   // Credits still needed for this category
  courseOptions: string[] // Expanded list of courses that satisfy this requirement
}

// ──────────────────────────────────────────────
// Parser function signature
// ──────────────────────────────────────────────

/**
 * Both the HTML parser and the PDF parser export a function matching
 * this signature so the router can call them interchangeably.
 */
export type AuditParser = (content: string) => StudentAuditData
