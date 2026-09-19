import { PrismaClient } from '@prisma/client'
import {
  validatePrerequisitesFromTree,
  type PrerequisiteNodeData,
  type PrerequisiteValidationResult,
  type StudentTranscript,
} from '../shared/prerequisite-evaluator'

const prisma = new PrismaClient()

export type { StudentTranscript, PrerequisiteValidationResult }

export async function validatePrerequisites(
  courseId: string,
  transcript: StudentTranscript
): Promise<PrerequisiteValidationResult> {
  try {
    const prerequisite = await prisma.prerequisite.findUnique({
      where: { courseId }
    })

    const nodes = await prisma.prerequisiteNode.findMany({
      where: { courseId },
      orderBy: { createdAt: 'asc' }
    })

    return validatePrerequisitesFromTree(
      prerequisite?.expression,
      nodes as PrerequisiteNodeData[],
      transcript
    )
  } catch (error) {
    return {
      isValid: false,
      reason: `Error validating prerequisites: ${error instanceof Error ? error.message : 'Unknown error'}`,
      expressionEvaluated: 'Error'
    }
  }
}

export async function getPrerequisiteExplanation(
  courseId: string,
  transcript: StudentTranscript
): Promise<string> {
  const result = await validatePrerequisites(courseId, transcript)

  if (result.isValid) {
    return `[PASS] You meet all prerequisites for ${courseId}`
  }

  let explanation = `[FAIL] You do not meet the prerequisites for ${courseId}:\n`
  explanation += `Required: ${result.expressionEvaluated}\n\n`

  if (result.missingCourses && result.missingCourses.length > 0) {
    explanation += `Missing courses: ${result.missingCourses.join(', ')}\n`
  }

  if (result.gradeIssues && result.gradeIssues.length > 0) {
    explanation += `Grade requirements not met: ${result.gradeIssues.join(', ')}\n`
  }

  if (result.yearRequirement) {
    explanation += `Requires: ${result.yearRequirement.replace('_', ' ')}\n`
  }

  if (result.needsPermission) {
    explanation += `Requires special permission from instructor/department\n`
  }

  if (result.reason) {
    explanation += `Details: ${result.reason}`
  }

  return explanation
}

export async function cleanup() {
  await prisma.$disconnect()
}
