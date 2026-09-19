import type { PrismaClient } from '@prisma/client'
import { validatePrerequisites } from '../../cli/prerequisite-validator'
import { fetchSectionMeetings } from './section-meetings'

export interface TimeSlot {
  day: string
  startTime: string
  endTime: string
}

export interface Section {
  id: string
  courseId: string
  crn: string | null
  sectionCode: string
  sectionType: string
  instructor: string | null
  location: string | null
  capacity: number | null
  enrolled: number | null
  timeSlots: TimeSlot[]
}

export interface ScheduleSelection {
  courseId: string
  section: Section
}

export interface GeneratedSchedule {
  id: number
  selections: ScheduleSelection[]
  hasConflicts: boolean
  score?: number
  prerequisiteInfo?: {
    [courseId: string]: {
      isValid: boolean
      reason?: string
      missingCourses?: string[]
      expressionEvaluated: string
    }
  }
}

export interface GenerateSchedulesOptions {
  courseIds: string[]
  term?: string
  maxSchedules: number
  completedCourses?: string[]
  includePrerequisites?: boolean
}

export function parseDays(daysStr: string | null): string[] {
  if (!daysStr) return []

  const dayMap: { [key: string]: string } = {
    M: 'Monday',
    T: 'Tuesday',
    W: 'Wednesday',
    R: 'Thursday',
    F: 'Friday'
  }

  return daysStr.split('').map(d => dayMap[d] || d).filter(Boolean)
}

export function hasTimeConflict(slot1: TimeSlot, slot2: TimeSlot): boolean {
  if (slot1.day !== slot2.day) return false

  const parseTime = (time: string): number => {
    const padded = time.padStart(4, '0')
    const hours = parseInt(padded.substring(0, 2))
    const minutes = parseInt(padded.substring(2, 4))
    return hours * 60 + minutes
  }

  const start1 = parseTime(slot1.startTime)
  const end1 = parseTime(slot1.endTime)
  const start2 = parseTime(slot2.startTime)
  const end2 = parseTime(slot2.endTime)

  return start1 < end2 && start2 < end1
}

function getTimeSlots(section: Section): TimeSlot[] {
  return section.timeSlots
}

function hasConflictWithSelections(
  section: Section,
  currentSelections: ScheduleSelection[]
): boolean {
  const newTimeSlots = getTimeSlots(section)

  for (const selection of currentSelections) {
    const existingTimeSlots = getTimeSlots(selection.section)

    for (const newSlot of newTimeSlots) {
      for (const existingSlot of existingTimeSlots) {
        if (hasTimeConflict(newSlot, existingSlot)) {
          return true
        }
      }
    }
  }

  return false
}

function groupSectionsByType(sections: Section[]): { [type: string]: Section[] } {
  const grouped: { [type: string]: Section[] } = {}

  for (const section of sections) {
    if (!grouped[section.sectionType]) {
      grouped[section.sectionType] = []
    }
    grouped[section.sectionType].push(section)
  }

  return grouped
}

function generateSectionCombinations(
  sectionsByType: { [type: string]: Section[] }
): Section[][] {
  const types = Object.keys(sectionsByType)

  if (types.length === 0) return []
  if (types.length === 1) {
    return sectionsByType[types[0]].map(section => [section])
  }

  const combinations: Section[][] = []

  function buildCombination(typeIndex: number, current: Section[]) {
    if (typeIndex === types.length) {
      combinations.push([...current])
      return
    }

    const currentType = types[typeIndex]
    for (const section of sectionsByType[currentType]) {
      current.push(section)
      buildCombination(typeIndex + 1, current)
      current.pop()
    }
  }

  buildCombination(0, [])
  return combinations
}

function hasInternalConflicts(sections: Section[]): boolean {
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const slots1 = getTimeSlots(sections[i])
      const slots2 = getTimeSlots(sections[j])

      for (const slot1 of slots1) {
        for (const slot2 of slots2) {
          if (hasTimeConflict(slot1, slot2)) {
            return true
          }
        }
      }
    }
  }
  return false
}

function generateSchedulesRecursive(
  courseSections: { courseId: string; sections: Section[] }[],
  currentIndex: number,
  currentSelections: ScheduleSelection[],
  maxSchedules: number,
  result: GeneratedSchedule[]
): void {
  if (result.length >= maxSchedules) {
    return
  }

  if (currentIndex === courseSections.length) {
    result.push({
      id: result.length + 1,
      selections: [...currentSelections],
      hasConflicts: false
    })
    return
  }

  const { courseId, sections } = courseSections[currentIndex]
  const sectionsByType = groupSectionsByType(sections)
  const combinations = generateSectionCombinations(sectionsByType)

  for (const sectionCombination of combinations) {
    if (result.length >= maxSchedules) {
      return
    }

    if (hasInternalConflicts(sectionCombination)) {
      continue
    }

    let hasConflict = false
    for (const section of sectionCombination) {
      if (hasConflictWithSelections(section, currentSelections)) {
        hasConflict = true
        break
      }
    }

    if (!hasConflict) {
      for (const section of sectionCombination) {
        currentSelections.push({ courseId, section })
      }

      generateSchedulesRecursive(
        courseSections,
        currentIndex + 1,
        currentSelections,
        maxSchedules,
        result
      )

      if (result.length >= maxSchedules) {
        for (let i = 0; i < sectionCombination.length; i++) {
          currentSelections.pop()
        }
        return
      }

      for (let i = 0; i < sectionCombination.length; i++) {
        currentSelections.pop()
      }
    }
  }
}

export async function loadCourseSectionsForScheduling(
  prisma: PrismaClient,
  courseIds: string[],
  term?: string
): Promise<{ courseId: string; sections: Section[] }[]> {
  return Promise.all(
    courseIds.map(async (courseId: string) => {
      const sections = await prisma.section.findMany({
        where: {
          courseId: courseId.toUpperCase(),
          ...(term && { term })
        }
      })

      const meetingsBySection = await fetchSectionMeetings(prisma, sections.map(section => section.id))

      const normalizedSections = sections.map((section) => ({
        id: section.id,
        courseId: section.courseId,
        crn: section.crn,
        sectionCode: section.sectionCode,
        sectionType: section.sectionType,
        instructor: section.instructor,
        location: section.location,
        capacity: section.capacity,
        enrolled: section.enrolled,
        timeSlots: (meetingsBySection.get(section.id) || []).flatMap((meeting) => {
          if (!meeting.days || !meeting.startTime || !meeting.endTime) {
            return []
          }

          return parseDays(meeting.days).map(day => ({
            day,
            startTime: meeting.startTime,
            endTime: meeting.endTime
          }))
        })
      }))

      return {
        courseId: courseId.toUpperCase(),
        sections: normalizedSections as Section[]
      }
    })
  )
}

export async function generateSchedulesForCourses(
  prisma: PrismaClient,
  options: GenerateSchedulesOptions
): Promise<GeneratedSchedule[]> {
  const {
    courseIds,
    term,
    maxSchedules,
    completedCourses = [],
    includePrerequisites = true
  } = options

  const courseSections = await loadCourseSectionsForScheduling(prisma, courseIds, term)

  const coursesWithoutSections = courseSections.filter(cs => cs.sections.length === 0)
  if (coursesWithoutSections.length > 0) {
    throw new Error(`No sections found for courses: ${coursesWithoutSections.map(cs => cs.courseId).join(', ')}`)
  }

  const schedules: GeneratedSchedule[] = []
  generateSchedulesRecursive(courseSections, 0, [], maxSchedules, schedules)

  if (!includePrerequisites) {
    return schedules
  }

  const transcript = {
    completedCourses: completedCourses.map((c: string) => c.toUpperCase()),
    currentYear: 'FOURTH_YEAR' as const
  }

  for (const schedule of schedules) {
    const prerequisiteInfo: { [courseId: string]: any } = {}

    for (const selection of schedule.selections) {
      const result = await validatePrerequisites(selection.courseId, transcript)
      prerequisiteInfo[selection.courseId] = {
        isValid: result.isValid,
        reason: result.reason,
        missingCourses: result.missingCourses,
        expressionEvaluated: result.expressionEvaluated
      }
    }

    schedule.prerequisiteInfo = prerequisiteInfo
  }

  return schedules
}

export function estimateCourseBranching(sections: Section[]): number {
  const sectionsByType = groupSectionsByType(sections)
  const combinations = generateSectionCombinations(sectionsByType)
  return combinations.filter(combo => !hasInternalConflicts(combo)).length
}
