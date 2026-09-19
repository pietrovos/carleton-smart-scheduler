import { API_BASE_URL, SCHEDULE_CONFIG } from '../config/constants';

export interface TimeSlot {
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
  startTime: string;
  endTime: string;
}

export interface Section {
  crn: string;
  sectionCode: string;
  type: 'Lecture' | 'Tutorial' | 'Lab';
  instructor: string;
  timeSlots: TimeSlot[];
  capacity: number;
  enrolled: number;
}

export interface CourseSchedule {
  courseCode: string;
  sections: Section[];
}

export interface PrerequisiteInfo {
  isValid: boolean;
  reason?: string;
  missingCourses?: string[];
  expressionEvaluated: string;
}

export interface GeneratedSchedule {
  id: number;
  selections: {
    courseCode: string;
    section: Section;
  }[];
  hasUnmetPrerequisites: boolean;
  prerequisiteInfo?: {
    [courseId: string]: PrerequisiteInfo;
  };
}

interface ApiSection {
  crn: string | null;
  sectionCode: string;
  sectionType: string;
  timeSlots: TimeSlot[];
  instructor: string | null;
  capacity: number | null;
  enrolled: number | null;
}

interface ApiScheduleSelection {
  courseId: string;
  section: ApiSection;
}

interface ApiSchedule {
  selections: ApiScheduleSelection[];
  prerequisiteInfo?: { [courseId: string]: PrerequisiteInfo };
}

/**
 * Generate all possible schedules using the backend API
 * Falls back to error message if API fails
 *
 * @param activeTerm - Carleton term code (e.g. "202630") so the backend
 *                     only returns sections for the requested semester.
 */
export async function generateSchedules(
  courseCodes: string[],
  completedCourses: string[],
  activeTerm?: string
): Promise<GeneratedSchedule[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/schedules/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        courseIds: courseCodes,
        completedCourses: completedCourses,
        maxSchedules: SCHEDULE_CONFIG.MAX_SCHEDULES,
        ...(activeTerm && { term: activeTerm })
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to generate schedules');
    }

    const data = await response.json();
    
    return data.schedules.map((schedule: ApiSchedule, index: number) => {
      const hasPrerequisites = schedule.prerequisiteInfo && 
        Object.values(schedule.prerequisiteInfo).some((info: PrerequisiteInfo) => 
          info.expressionEvaluated && info.expressionEvaluated !== 'None'
        );
      
      return {
        id: index + 1,
        selections: schedule.selections.map((sel: ApiScheduleSelection) => ({
          courseCode: sel.courseId,
          section: mapApiSectionToFrontend(sel.section)
        })),
        hasUnmetPrerequisites: hasPrerequisites || false,
        prerequisiteInfo: schedule.prerequisiteInfo || {}
      };
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Map backend section format to frontend Section interface
 */
function mapApiSectionToFrontend(apiSection: ApiSection): Section {
  const timeSlots: TimeSlot[] = apiSection.timeSlots.map((slot) => ({
    day: slot.day,
    startTime: formatTime(slot.startTime),
    endTime: formatTime(slot.endTime)
  }));

  return {
    crn: apiSection.crn || '',
    sectionCode: apiSection.sectionCode,
    type: apiSection.sectionType as 'Lecture' | 'Tutorial' | 'Lab',
    instructor: apiSection.instructor || 'TBA',
    timeSlots,
    capacity: apiSection.capacity || 0,
    enrolled: apiSection.enrolled || 0
  };
}

/**
 * Format time from "0835" to "08:35"
 */
function formatTime(time: string | null): string {
  if (!time || time.length !== 4) return '00:00';
  return `${time.substring(0, 2)}:${time.substring(2, 4)}`;
}

/**
 * Check for time conflicts between two time slots
 */
export function hasTimeConflict(slot1: TimeSlot, slot2: TimeSlot): boolean {
  if (slot1.day !== slot2.day) return false;
  
  const start1 = parseTime(slot1.startTime);
  const end1 = parseTime(slot1.endTime);
  const start2 = parseTime(slot2.startTime);
  const end2 = parseTime(slot2.endTime);

  return start1 < end2 && start2 < end1;
}

/**
 * Parse time string "HH:MM" to minutes since midnight
 */
function parseTime(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}
