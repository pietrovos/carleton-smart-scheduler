import { API_BASE_URL, SCHEDULE_CONFIG } from '../config/constants';
import type { TimeSlot } from './scheduleGenerator';
import type { PrerequisiteNodeData, PrerequisiteValidationResult } from '@shared/prerequisite-evaluator';

export type PrerequisiteNode = PrerequisiteNodeData;

export interface Course {
  code: string;
  name: string;
  credits: number;
  prerequisites: string[];
  prerequisiteTree?: PrerequisiteNode[];
  prerequisiteExpression?: string;
  description: string;
  type?: 'core' | 'technical-elective' | 'complementary-elective';
  sectionTypes?: string[];
  sectionCount?: number;
  hasSections?: boolean;
  terms?: string[];
}

export interface CourseMeeting {
  days: string;
  startTime: string;
  endTime: string;
  startDate?: string | null;
  endDate?: string | null;
  roomCapacity?: number | null;
}

export interface CourseSection {
  sectionId: string;
  sectionCode: string;
  type: string;
  instructor: string;
  location?: string | null;
  term?: string | null;
  capacity?: number | null;
  enrolled?: number | null;
  status?: string | null;
  meetings: CourseMeeting[];
  timeSlots: TimeSlot[];
}

// Cache for search results - stores results for 5 minutes
const searchCache = new Map<string, { results: Course[]; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cache for individual course lookups
const courseCache = new Map<string, { course: Course; timestamp: number }>();
const sectionCache = new Map<string, { sections: CourseSection[]; timestamp: number }>();

// Current abort controller for search requests
let currentSearchController: AbortController | null = null;

/**
 * Clear expired cache entries
 */
function cleanCache() {
  const now = Date.now();
  for (const [key, value] of searchCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      searchCache.delete(key);
    }
  }
  for (const [key, value] of courseCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      courseCache.delete(key);
    }
  }
  for (const [key, value] of sectionCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      sectionCache.delete(key);
    }
  }
}

// Clean cache periodically
setInterval(cleanCache, 60 * 1000);

/**
 * Search for courses using the backend API
 * - Returns cached results if available
 * - Cancels any in-flight requests when a new search starts
 */
export async function searchCourses(query: string, term?: string): Promise<Course[]> {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedTerm = term?.trim() || '';
  
  // Check minimum query length
  if (normalizedQuery.length < 2) return [];
  
  // Check cache first
  const cacheKey = `${normalizedQuery}:${normalizedTerm}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.results;
  }
  
  // Cancel any in-flight search request
  if (currentSearchController) {
    currentSearchController.abort();
  }
  
  // Create new abort controller for this request
  currentSearchController = new AbortController();
  const signal = currentSearchController.signal;
  
  try {
    const response = await fetch(
      `${API_BASE_URL}/courses/search?q=${encodeURIComponent(normalizedQuery)}${normalizedTerm ? `&term=${encodeURIComponent(normalizedTerm)}` : ''}`,
      { signal }
    );
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    
    const results = data.results.map((course: Course & { type?: string }) => ({
      code: course.code,
      name: course.name || course.code,
      credits: course.credits || 0,
      prerequisites: course.prerequisites || [],
      prerequisiteTree: course.prerequisiteTree || [],
      prerequisiteExpression: course.prerequisiteExpression || '',
      description: course.description || '',
      type: course.type as 'core' | 'technical-elective' | 'complementary-elective' | undefined,
      sectionTypes: course.sectionTypes || [],
      terms: course.terms || []
    })).slice(0, SCHEDULE_CONFIG.MAX_SEARCH_RESULTS);
    
    // Cache the results
    searchCache.set(cacheKey, { results, timestamp: Date.now() });
    
    return results;
  } catch (error) {
    // Don't treat aborted requests as errors
    if (error instanceof Error && error.name === 'AbortError') {
      return [];
    }
    return [];
  }
}

/**
 * Get a single course by its code
 * - Returns cached result if available
 */
export async function getCourseByCode(code: string): Promise<Course | undefined> {
  const normalizedCode = code.trim().toUpperCase();
  
  // Check cache first
  const cached = courseCache.get(normalizedCode);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.course;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/courses/${encodeURIComponent(normalizedCode)}`);
    
    if (!response.ok) {
      const fallback: Course = {
        code: normalizedCode,
        name: normalizedCode,
        credits: 0,
        prerequisites: [],
        description: 'Course not available in database',
        hasSections: false,
        sectionCount: 0
      };
      courseCache.set(normalizedCode, { course: fallback, timestamp: Date.now() });
      return fallback;
    }
    
    const data = await response.json();
    
    const course: Course = {
      code: data.code,
      name: data.name || data.code,
      credits: data.credits || 0,
      prerequisites: data.prerequisites || [],
      prerequisiteTree: data.prerequisiteTree || [],
      prerequisiteExpression: data.prerequisiteExpression || '',
      description: data.description || '',
      type: data.type as 'core' | 'technical-elective' | 'complementary-elective' | undefined,
      sectionCount: data.sectionCount || 0,
      hasSections: (data.sectionCount || 0) > 0,
      terms: data.terms || []
    };
    
    // Cache the result
    courseCache.set(normalizedCode, { course, timestamp: Date.now() });
    
    return course;
  } catch {
    const fallback: Course = {
      code: normalizedCode,
      name: normalizedCode,
      credits: 0,
      prerequisites: [],
      description: 'Error loading course',
      hasSections: false,
      sectionCount: 0
    };
    return fallback;
  }
}

export async function getCourseSections(code: string, term: string): Promise<CourseSection[]> {
  const normalizedCode = code.trim().toUpperCase();
  const cacheKey = `${normalizedCode}:${term}`;

  const cached = sectionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.sections;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/courses/${encodeURIComponent(normalizedCode)}/sections?term=${encodeURIComponent(term)}`
    );

    if (!response.ok) {
      sectionCache.set(cacheKey, { sections: [], timestamp: Date.now() });
      return [];
    }

    const data = await response.json();
    const sections: CourseSection[] = (data.sections || []).map((section: any) => ({
      sectionId: section.sectionId,
      sectionCode: section.sectionCode,
      type: section.type,
      instructor: section.instructor || 'TBA',
      location: section.location ?? null,
      term: section.term ?? null,
      capacity: section.capacity ?? null,
      enrolled: section.enrolled ?? null,
      status: section.status ?? null,
      meetings: section.meetings || [],
      timeSlots: (section.meetings || []).flatMap((meeting: any) =>
        expandMeetingDays(meeting.days, meeting.startTime, meeting.endTime)
      ),
    }));

    sectionCache.set(cacheKey, { sections, timestamp: Date.now() });
    return sections;
  } catch {
    return [];
  }
}

function expandMeetingDays(days: string | null, startTime: string | null, endTime: string | null): TimeSlot[] {
  if (!days || !startTime || !endTime) return [];

  return days
    .split('')
    .map((day) => mapDayCode(day))
    .filter((day): day is TimeSlot['day'] => Boolean(day))
    .map((day) => ({
      day,
      startTime: formatSectionTime(startTime),
      endTime: formatSectionTime(endTime),
    }));
}

function mapDayCode(day: string): TimeSlot['day'] | null {
  switch (day) {
    case 'M':
      return 'Monday';
    case 'T':
      return 'Tuesday';
    case 'W':
      return 'Wednesday';
    case 'R':
      return 'Thursday';
    case 'F':
      return 'Friday';
    default:
      return null;
  }
}

function formatSectionTime(time: string): string {
  if (time.length !== 4) return '00:00';
  return `${time.slice(0, 2)}:${time.slice(2, 4)}`;
}
