/**
 * Elective category mappings restricted to courses that appear in Sched.csv,
 * so every selectable elective has seeded timetable data.
 */

export const CS_ELECTIVES = [
  'COMP2108', 'COMP2401', 'COMP2402', 'COMP2404', 'COMP2406', 'COMP2501',
  'COMP3000', 'COMP3002', 'COMP3004', 'COMP3007', 'COMP3008',
  'COMP3203', 'COMP3308', 'COMP3804',
  'COMP4107', 'COMP4108', 'COMP4203', 'COMP4501',
  'COMP4602', 'COMP4806', 'COMP4900', 'COMP4901', 'COMP4905'
]

export const SCIENCE_ELECTIVES = [
  'PHYS1902', 'PHYS2004', 'PHYS2203', 'PHYS2305', 'PHYS2903',
  'CHEM2104', 'CHEM2204', 'CHEM2208', 'CHEM2303', 'CHEM2400', 'CHEM2501',
  'BIOL1902', 'BIOL2001', 'BIOL2104', 'BIOL2107', 'BIOL2200', 'BIOL2201',
  'ERTH1011', 'ERTH2312', 'ERTH2316', 'ERTH2404'
]

export const COMPLEMENTARY_STUDIES_ELECTIVES = [
  'PHIL1200', 'PHIL1301', 'PHIL2001', 'PHIL2003', 'PHIL2380',
  'SOCI1001', 'SOCI1002', 'SOCI2000', 'SOCI2001',
  'PSYC1001', 'PSYC1002', 'PSYC2001', 'PSYC2002',
  'ECON1001', 'ECON1002', 'ECON2009', 'ECON2020',
  'BUSI1001', 'BUSI1002', 'BUSI1003', 'BUSI2001',
  'TSES2305', 'TSES3001', 'TSES4002', 'TSES4012',
  'CCDP2100'
]

export const ELECTIVE_CATEGORIES: Record<string, string[]> = {
  CS_ELECTIVE: CS_ELECTIVES,
  SCIENCE_ELECTIVE: SCIENCE_ELECTIVES,
  COMPLEMENTARY_STUDIES: COMPLEMENTARY_STUDIES_ELECTIVES
}

export function expandElectiveCategories(courseOptions: string[]): string[] {
  const expanded: string[] = []

  for (const option of courseOptions) {
    if (ELECTIVE_CATEGORIES[option]) {
      expanded.push(...ELECTIVE_CATEGORIES[option])
    } else {
      expanded.push(option)
    }
  }

  return [...new Set(expanded)]
}

export function courseMatchesCategory(courseId: string, category: string): boolean {
  const courses = ELECTIVE_CATEGORIES[category]
  if (!courses) return false
  return courses.includes(courseId)
}
