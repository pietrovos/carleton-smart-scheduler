/**
 * Requirement filter — decides which sub-requirements from the audit are
 * "actionable" (i.e. represent courses the student can actually schedule).
 *
 * Non-actionable rows include:
 *   - Zero-credit requirements (rqdHours = 0)
 *   - Very-high-credit "excess" trackers (rqdHours >= 100)
 *   - Year-standing checks ("must have third-year standing")
 *   - Residency requirements ("must complete X credits at Carleton")
 *   - CGPA / GPA thresholds
 *   - Requirements that have no course options and no elective category
 *
 * This filter is applied after parsing so the parsers themselves can stay
 * simple — they extract everything, and we throw away the noise here.
 */

import type { RequirementInfo } from './types'

/** Patterns in the title that mark a non-schedulable row. */
const NON_ACTIONABLE_TITLE_PATTERNS = [
  /year\s+standing/i,
  /residency/i,
  /cgpa\s+required/i,
  /cgpa\s+must/i,
  /gpa\s+required/i,
  /minimum\s+cgpa/i,
  /co-?op/i,              // co-op work terms aren't courses
  /work\s+term/i,
]

/**
 * Returns true if a requirement represents something the student can
 * actually take action on (i.e. register for a course).
 *
 * This deliberately errs on the side of inclusion — if we're not sure,
 * keep it.  The schedule generator will do its own prerequisite / section
 * availability checks downstream.
 */
export function isActionableRequirement(req: RequirementInfo): boolean {
  // 1. Zero or absurdly-high credit rows are bookkeeping, not courses
  if (req.creditsRequired <= 0 || req.creditsRequired >= 100) {
    return false
  }

  // 2. Title-based pattern exclusion
  for (const pattern of NON_ACTIONABLE_TITLE_PATTERNS) {
    if (pattern.test(req.title)) {
      return false
    }
  }

  // 3. Must have at least one course option or elective token
  if (req.courseOptions.length === 0) {
    return false
  }

  return true
}
