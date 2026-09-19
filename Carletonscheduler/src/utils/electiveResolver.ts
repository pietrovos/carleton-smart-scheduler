import { getCourseByCode } from './courseData';
import type { ElectiveRequirement } from '../types/electives';
import { collectRequestedElectiveCounts, getSelectionUnitCredits } from './electiveUtils';

interface ResolveElectivesParams {
  courses: string[];
  electiveRequirements: ElectiveRequirement[];
  selectedElectives: Record<string, string[]>;
  completedCourses: string[];
  activeTerm: string;
}

interface ResolveElectivesResult {
  resolvedCourses: string[];
  resolvedElectives: Record<string, string[]>;
  requestedElectiveCredits: Record<string, number>;
}

export async function resolveElectiveSelections({
  courses,
  electiveRequirements,
  selectedElectives,
  completedCourses,
  activeTerm,
}: ResolveElectivesParams): Promise<ResolveElectivesResult> {
  const resolvedCourses = courses.filter(course => !course.startsWith('ELECTIVE:'));
  const resolvedElectives: Record<string, string[]> = {};
  const requestedElectiveCredits: Record<string, number> = {};
  const requestedElectiveCounts = collectRequestedElectiveCounts(courses);

  for (const [category, tokenCount] of requestedElectiveCounts.entries()) {
    const requirement = electiveRequirements.find(item => item.category === category);
    if (!requirement) continue;

    const selectionUnitCredits = getSelectionUnitCredits(requirement);
    const requestedCredits = Math.min(tokenCount * selectionUnitCredits, requirement.creditsNeeded);
    requestedElectiveCredits[category] = requestedCredits;

    const pickedCourses = await pickElectiveCourses({
      requirement,
      requestedCredits,
      existingPicks: selectedElectives[category] || [],
      completedCourses,
      selectionUnitCredits,
      activeTerm,
    });

    if (pickedCourses.length > 0) {
      resolvedCourses.push(...pickedCourses);
      resolvedElectives[category] = pickedCourses;
    }
  }

  return {
    resolvedCourses,
    resolvedElectives,
    requestedElectiveCredits,
  };
}

interface PickElectiveCoursesParams {
  requirement: ElectiveRequirement;
  requestedCredits: number;
  existingPicks: string[];
  completedCourses: string[];
  selectionUnitCredits: number;
  activeTerm: string;
}

async function pickElectiveCourses({
  requirement,
  requestedCredits,
  existingPicks,
  completedCourses,
  selectionUnitCredits,
  activeTerm,
}: PickElectiveCoursesParams): Promise<string[]> {
  let creditsFilled = 0;
  const pickedCourses: string[] = [];
  const seenCourses = new Set<string>();

  const tryAddCourse = async (courseCode: string, requirePrereqs: boolean) => {
    if (seenCourses.has(courseCode) || creditsFilled >= requestedCredits) return;

    const courseInfo = await getCourseByCode(courseCode);
    const hasSectionsInActiveTerm = (courseInfo?.terms || []).includes(activeTerm);
    if (!courseInfo || !hasSectionsInActiveTerm) return;

    const prereqsMet =
      courseInfo.prerequisites.length === 0 ||
      courseInfo.prerequisites.every(prereq => completedCourses.includes(prereq));

    if (requirePrereqs && !prereqsMet) return;

    pickedCourses.push(courseCode);
    seenCourses.add(courseCode);
    creditsFilled += courseInfo.credits || selectionUnitCredits;
  };

  for (const existingPick of existingPicks) {
    await tryAddCourse(existingPick, false);
  }

  for (const option of requirement.courseOptions) {
    if (creditsFilled >= requestedCredits) break;
    await tryAddCourse(option, true);
  }

  if (creditsFilled < requestedCredits) {
    for (const option of requirement.courseOptions) {
      if (creditsFilled >= requestedCredits) break;
      await tryAddCourse(option, false);
    }
  }

  return pickedCourses;
}
