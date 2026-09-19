import type { ElectiveRequirement } from '../types/electives';

export const DEFAULT_ELECTIVE_SELECTION_CREDITS = 0.5;

export function getElectiveTokenCategory(token: string): string | null {
  if (!token.startsWith('ELECTIVE:')) return null;
  const [, category] = token.split(':');
  return category || null;
}

export function getElectiveTokenIndex(token: string): number | null {
  if (!token.startsWith('ELECTIVE:')) return null;
  const [, , rawIndex] = token.split(':');
  const index = Number(rawIndex);
  return Number.isFinite(index) ? index : null;
}

export function buildElectiveToken(category: string, index: number): string {
  return `ELECTIVE:${category}:${index}`;
}

export function getSelectionUnitCredits(elective: ElectiveRequirement): number {
  return elective.selectionUnitCredits || DEFAULT_ELECTIVE_SELECTION_CREDITS;
}

export function getElectiveSlotCount(elective: ElectiveRequirement): number {
  return Math.max(1, Math.round(elective.creditsNeeded / getSelectionUnitCredits(elective)));
}

export function getSelectedElectiveTokenCount(selectedCourses: string[], category: string): number {
  return selectedCourses.filter(code => getElectiveTokenCategory(code) === category).length;
}

export function getMissingElectiveTokenNumbers(
  selectedCourses: string[],
  category: string,
  slotCount: number,
): number[] {
  const existing = new Set(
    selectedCourses
      .filter(code => getElectiveTokenCategory(code) === category)
      .map(code => getElectiveTokenIndex(code))
      .filter((index): index is number => index !== null),
  );

  const missing: number[] = [];
  for (let index = 1; index <= slotCount; index += 1) {
    if (!existing.has(index)) {
      missing.push(index);
    }
  }

  return missing;
}

export function collectRequestedElectiveCounts(courses: string[]): Map<string, number> {
  const requestedCounts = new Map<string, number>();

  for (const course of courses) {
    const category = getElectiveTokenCategory(course);
    if (!category) continue;
    requestedCounts.set(category, (requestedCounts.get(category) || 0) + 1);
  }

  return requestedCounts;
}
