/**
 * cli/audit/index.ts — barrel export for the new audit module.
 *
 * Consumers should import from here:
 *
 *   import { ingestAudit, isActionableRequirement } from '../audit'
 *   import type { StudentAuditData, RequirementInfo } from '../audit'
 *
 * The old cli/audit-parser.ts continues to work (unchanged), but new
 * code should prefer this module.  Once Prompts 2-4 are complete the
 * old file will be removed.
 */

// Types
export type {
  RequirementStatus,
  RequirementInfo,
  CompletedCourse,
  CurrentCourse,
  StudentAuditData,
  ElectiveRequirement,
  AuditParser,
} from './types'

// Smart ingestor router
export {
  ingestAudit,
  detectFormat,
  detectFormatFromPath,
  registerParser,
} from './router'
export type { AuditFormat, IngestOptions } from './router'

// Requirement filter
export { isActionableRequirement } from './filter'

// Individual parsers (for direct use / testing)
export { parseHTML } from './parse-html'
export { parsePDF } from './parse-pdf'
