/*
 * Schedule generation using backtracking to find all conflict-free timetables.
 */

import { Router, Request, Response } from 'express'
import { prisma } from '../index'
import { generateSchedulesForCourses } from '../lib/schedule-generation'

const router = Router()

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { courseIds, term, maxSchedules = 50, completedCourses = [] } = req.body

    if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'courseIds array is required'
      })
    }

    if (courseIds.length > 8) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Maximum 8 courses allowed to prevent timeout'
      })
    }

    const schedules = await generateSchedulesForCourses(prisma, {
      courseIds,
      term,
      maxSchedules,
      completedCourses,
      includePrerequisites: true
    })

    res.json({
      schedules,
      count: schedules.length,
      requested: courseIds.length,
      maxSchedules
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate schedules'
    const isMissingSections = message.startsWith('No sections found for courses:')
    if (isMissingSections) {
      return res.status(404).json({
        error: 'Not Found',
        message
      })
    }

    console.error('Generate schedules error:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate schedules'
    })
  }
})

export default router
