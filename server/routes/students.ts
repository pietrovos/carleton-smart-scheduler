/**
 * @file server/routes/students.ts
 * @description Student management and prerequisite validation endpoints
 * 
 * Design Pattern: Service Layer Pattern
 * - Routes delegate complex business logic to service functions
 * - Keeps route handlers thin and focused on HTTP concerns
 * 
 * Key Algorithms:
 * 1. Prerequisite validation using tree traversal
 * 2. Eligible course calculation using batch validation
 */

import { Router, Request, Response } from 'express'
import { prisma } from '../index'
import { validatePrerequisites, StudentTranscript } from '../../cli/prerequisite-validator'
import { authenticateToken, requireRole } from '../middleware/auth'

const router = Router()

router.use(authenticateToken, requireRole('ADMIN'))

/**
 * GET /api/students/:studentId
 * Get student profile and completed courses
 * 
 * Use Case: Display student information and academic history
 */
router.get('/:studentId', async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params
    
    const student = await prisma.student.findUnique({
      where: { studentId },
      include: {
        courseCompletions: {
          include: { course: true },
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    if (!student) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Student ${studentId} not found`
      })
    }

    res.json({
      studentId: student.studentId,
      name: student.name,
      program: student.program,
      completedCourses: student.courseCompletions.map(c => ({
        courseId: c.courseId,
        courseName: c.course.title,
        grade: c.grade
      }))
    })
  } catch (error) {
    console.error('Get student error:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch student data'
    })
  }
})

/**
 * POST /api/students/:studentId/validate
 * Validate if student meets prerequisites for a specific course
 * 
 * Request Body:
 * - courseId: Course to validate
 * - currentYear: Student's current year standing (optional)
 * 
 * Algorithm: Recursive prerequisite tree evaluation
 * - Traverses AND/OR nodes in prerequisite tree
 * - Checks course completion, grade requirements, year standing
 * - Returns detailed explanation of validation result
 */
router.post('/:studentId/validate', async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params
    const { courseId, currentYear } = req.body

    if (!courseId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'courseId is required in request body'
      })
    }

    const student = await prisma.student.findUnique({
      where: { studentId },
      include: { courseCompletions: true }
    })

    if (!student) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Student ${studentId} not found`
      })
    }

    // Build student transcript for validation
    const transcript: StudentTranscript = {
      completedCourses: student.courseCompletions.map(c => c.courseId),
      courseGrades: Object.fromEntries(
        student.courseCompletions.map(c => [c.courseId, c.grade])
      ),
      currentYear: currentYear || 'FOURTH_YEAR',
      hasSpecialPermission: false
    }

    const validationResult = await validatePrerequisites(courseId.toUpperCase(), transcript)

    res.json({
      courseId: courseId.toUpperCase(),
      isValid: validationResult.isValid,
      reason: validationResult.reason,
      missingCourses: validationResult.missingCourses,
      yearRequirement: validationResult.yearRequirement,
      needsPermission: validationResult.needsPermission,
      gradeIssues: validationResult.gradeIssues,
      prerequisiteExpression: validationResult.expressionEvaluated
    })
  } catch (error) {
    console.error('Validate prerequisites error:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate prerequisites'
    })
  }
})

/**
 * GET /api/students/:studentId/eligible
 * Get all courses the student is eligible to take
 * 
 * Algorithm: Batch prerequisite validation
 * Complexity: O(n * m) where n = total courses, m = avg prerequisite tree depth
 * 
 * Optimization: Could be cached and updated incrementally as student completes courses
 */
router.get('/:studentId/eligible', async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params
    const { limit = '50' } = req.query
    
    const student = await prisma.student.findUnique({
      where: { studentId },
      include: { courseCompletions: true }
    })

    if (!student) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Student ${studentId} not found`
      })
    }

    const transcript: StudentTranscript = {
      completedCourses: student.courseCompletions.map(c => c.courseId),
      courseGrades: Object.fromEntries(
        student.courseCompletions.map(c => [c.courseId, c.grade])
      ),
      currentYear: 'FOURTH_YEAR',
      hasSpecialPermission: false
    }

    // Get all courses that haven't been completed
    const allCourses = await prisma.course.findMany({
      where: {
        id: {
          notIn: transcript.completedCourses
        }
      },
      take: parseInt(limit as string) || 50
    })

    // Validate each course in parallel for performance
    const validationPromises = allCourses.map(async (course) => {
      try {
        const result = await validatePrerequisites(course.id, transcript)
        return {
          courseId: course.id,
          courseName: course.title,
          isEligible: result.isValid,
          validationResult: result
        }
      } catch (error) {
        return null
      }
    })

    const validationResults = (await Promise.all(validationPromises))
      .filter(result => result !== null && result.isEligible)

    res.json({
      studentId,
      eligibleCourses: validationResults,
      count: validationResults.length
    })
  } catch (error) {
    console.error('Get eligible courses error:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get eligible courses'
    })
  }
})

export default router
