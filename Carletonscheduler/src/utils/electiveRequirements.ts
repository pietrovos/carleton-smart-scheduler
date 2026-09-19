import type { ElectiveRequirement } from '../types/electives';

export function mergeElectiveRequirements(
  primary: ElectiveRequirement[],
  secondary: ElectiveRequirement[],
): ElectiveRequirement[] {
  const merged = new Map<string, ElectiveRequirement>();

  for (const requirement of secondary) {
    merged.set(requirement.category, requirement);
  }

  for (const requirement of primary) {
    merged.set(requirement.category, requirement);
  }

  return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label));
}
