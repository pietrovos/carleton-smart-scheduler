import { API_BASE_URL } from '../config/constants';
import type { ElectiveRequirement } from '../types/electives';
import { DEFAULT_ELECTIVE_SELECTION_CREDITS } from './electiveUtils';

interface ApiElectiveCategory {
  name: string;
  label: string;
  selectionUnitCredits?: number;
  courses: string[];
}

interface ApiElectiveResponse {
  categories?: ApiElectiveCategory[];
}

export async function fetchElectiveCatalog(): Promise<ElectiveRequirement[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/courses/electives`);
    if (!response.ok) {
      return [];
    }

    const data: ApiElectiveResponse = await response.json();

    return (data.categories || []).map((category) => ({
      category: category.name,
      label: category.label,
      creditsNeeded: 0,
      selectionUnitCredits: category.selectionUnitCredits || DEFAULT_ELECTIVE_SELECTION_CREDITS,
      courseOptions: category.courses || [],
    }));
  } catch {
    return [];
  }
}
