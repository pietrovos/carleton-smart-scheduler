/**
 * @file server/routes/admin.ts
 * @description Admin API endpoints for managing section data, electives, and courses
 */

import { Router, Request, Response } from 'express'
import { prisma } from '../index'
import multer from 'multer'
import { listElectiveCategoryDefinitions } from '../lib/electives'
import { ensureSectionMeetingsTable, insertSectionMeetings } from '../lib/section-meetings'
import { authenticateToken, requireRole } from '../middleware/auth'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

router.use(authenticateToken, requireRole('ADMIN'))

// ============================================================================
// SECTION DATA MANAGEMENT
// ============================================================================

interface TimetableRecord {
  term: string
  sectionId: string
  department: string
  courseNumber: string
  sectionCode: string
  sectionType: string
  days: string
  startTime: string
  endTime: string
  startDate: string
  endDate: string
  capacity: number
  enrolled: number
  status: string
}

function parseTimetableLine(line: string): TimetableRecord | null {
  const parts = line.trim().split('\t')
  if (parts.length < 14) return null

  const [
    term, sectionId, department, courseNumber, sectionCode, sectionType,
    days, startTime, endTime, startDate, endDate, capacity, enrolled, status
  ] = parts

  return {
    term,
    sectionId,
    department,
    courseNumber,
    sectionCode,
    sectionType,
    days: days || '',
    startTime: startTime || '',
    endTime: endTime || '',
    startDate,
    endDate,
    capacity: parseInt(capacity) || 0,
    enrolled: parseInt(enrolled) || 0,
    status
  }
}

/**
 * POST /api/admin/sections/upload
 * Upload section data file
 * 
 * Query params:
 * - mode: 'replace_all' | 'add_term'
 * - term: Required when mode is 'add_term' (e.g., '202730' for Fall 2027)
 */
router.post('/sections/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    await ensureSectionMeetingsTable(prisma)

    const file = req.file
    const { mode, term } = req.query

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    if (mode !== 'replace_all' && mode !== 'add_term') {
      return res.status(400).json({ error: 'Mode must be "replace_all" or "add_term"' })
    }

    if (mode === 'add_term' && !term) {
      return res.status(400).json({ error: 'Term is required when mode is "add_term"' })
    }

    const content = file.buffer.toString('utf-8')
    const lines = content.split('\n').filter(line => line.trim())

    // Parse all records
    const records: TimetableRecord[] = []
    for (const line of lines) {
      const record = parseTimetableLine(line)
      if (record) {
        // If adding for specific term, filter records
        if (mode === 'add_term' && record.term !== term) {
          continue
        }
        records.push(record)
      }
    }

    if (records.length === 0) {
      return res.status(400).json({ error: 'No valid records found in file' })
    }

    // Delete existing data based on mode
    if (mode === 'replace_all') {
      await prisma.section.deleteMany({})
    } else if (mode === 'add_term') {
      await prisma.section.deleteMany({
        where: { term: term as string }
      })
    }

    // Import new records
    let imported = 0
    let errors = 0

    for (const record of records) {
      const courseId = `${record.department}${record.courseNumber}`

      try {
        // Create course if it doesn't exist
        await prisma.course.upsert({
          where: { id: courseId },
          update: {},
          create: { id: courseId, title: courseId }
        })

        // Create section
        const section = await prisma.section.create({
          data: {
            crn: record.sectionId,
            courseId,
            sectionCode: record.sectionCode,
            sectionType: record.sectionType,
            term: record.term,
            capacity: record.capacity,
            enrolled: record.enrolled,
            status: record.status
          }
        })

        if (record.days || record.startTime || record.endTime || record.startDate || record.endDate) {
          await insertSectionMeetings(prisma, section.id, [{
            days: record.days || null,
            startTime: record.startTime || null,
            endTime: record.endTime || null,
            startDate: record.startDate || null,
            endDate: record.endDate || null,
            roomCapacity: null
          }])
        }

        imported++
      } catch (err) {
        errors++
      }
    }

    res.json({
      success: true,
      imported,
      errors,
      totalRecords: records.length,
      mode,
      term: mode === 'add_term' ? term : 'all'
    })
  } catch (error) {
    console.error('Section upload error:', error)
    res.status(500).json({ error: 'Failed to upload section data' })
  }
})

/**
 * GET /api/admin/sections/terms
 * Get list of all terms with section counts
 */
router.get('/sections/terms', async (req: Request, res: Response) => {
  try {
    const terms = await prisma.section.groupBy({
      by: ['term'],
      _count: { id: true },
      orderBy: { term: 'desc' }
    })

    res.json({
      terms: terms.map(t => ({
        code: t.term,
        sectionCount: t._count.id
      }))
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch terms' })
  }
})

/**
 * DELETE /api/admin/sections/term/:term
 * Delete all sections for a specific term
 */
router.delete('/sections/term/:term', async (req: Request, res: Response) => {
  try {
    const { term } = req.params
    const result = await prisma.section.deleteMany({
      where: { term }
    })

    res.json({
      success: true,
      deleted: result.count
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete term sections' })
  }
})

// ============================================================================
// ELECTIVE DATA MANAGEMENT
// ============================================================================

/**
 * GET /api/admin/electives
 * Get all elective categories and their courses
 */
router.get('/electives', async (req: Request, res: Response) => {
  try {
    const categories = await listElectiveCategoryDefinitions(prisma)

    res.json({
      categories: categories.map(category => ({
        name: category.id,
        label: category.label,
        selectionUnitCredits: category.selectionUnitCredits,
        courseCount: category.courses.length,
        courses: category.courses
      }))
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch elective categories' })
  }
})

/**
 * POST /api/admin/electives/:categoryId/courses
 * Add a course to an elective category
 * 
 * Body: { courseId: string }
 */
router.post('/electives/:categoryId/courses', async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params
    const { courseId } = req.body

    if (!courseId) {
      return res.status(400).json({ error: 'Course ID is required' })
    }

    const normalizedCourseId = courseId.toUpperCase().replace(/\s+/g, '')

    // Check if category exists
    const category = await prisma.electiveCategory.findUnique({
      where: { id: categoryId }
    })
    if (!category) {
      return res.status(404).json({ error: 'Elective category not found' })
    }

    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: normalizedCourseId }
    })
    if (!course) {
      return res.status(404).json({ error: 'Course not found' })
    }

    // Check if already in category
    const existing = await prisma.electiveCourse.findUnique({
      where: {
        categoryId_courseId: {
          categoryId,
          courseId: normalizedCourseId
        }
      }
    })
    if (existing) {
      return res.status(409).json({ error: 'Course already in this category' })
    }

    // Add course to category
    await prisma.electiveCourse.create({
      data: {
        categoryId,
        courseId: normalizedCourseId
      }
    })

    res.json({ success: true, courseId: normalizedCourseId, categoryId })
  } catch (error) {
    console.error('Add elective course error:', error)
    res.status(500).json({ error: 'Failed to add course to category' })
  }
})

/**
 * DELETE /api/admin/electives/:categoryId/courses/:courseId
 * Remove a course from an elective category
 */
router.delete('/electives/:categoryId/courses/:courseId', async (req: Request, res: Response) => {
  try {
    const { categoryId, courseId } = req.params
    const normalizedCourseId = courseId.toUpperCase()

    const result = await prisma.electiveCourse.delete({
      where: {
        categoryId_courseId: {
          categoryId,
          courseId: normalizedCourseId
        }
      }
    })

    res.json({ success: true, deleted: result })
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Course not found in this category' })
    }
    res.status(500).json({ error: 'Failed to remove course from category' })
  }
})

// ============================================================================
// COURSE & PREREQUISITE MANAGEMENT
// ============================================================================

/**
 * GET /api/admin/courses
 * Get all courses with pagination
 */
router.get('/courses', async (req: Request, res: Response) => {
  try {
    const { search, page = '1', limit = '50' } = req.query
    const pageNum = parseInt(page as string)
    const limitNum = Math.min(parseInt(limit as string), 100)
    const skip = (pageNum - 1) * limitNum

    const where = search ? {
      OR: [
        { id: { contains: (search as string).toUpperCase(), mode: 'insensitive' as const } },
        { title: { contains: search as string, mode: 'insensitive' as const } }
      ]
    } : {}

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        include: {
          prerequisiteExpression: true,
          prerequisiteNodes: {
            orderBy: { createdAt: 'asc' }
          },
          _count: { select: { sections: true } }
        },
        skip,
        take: limitNum,
        orderBy: { id: 'asc' }
      }),
      prisma.course.count({ where })
    ])

    res.json({
      courses: courses.map(c => ({
        id: c.id,
        title: c.title,
        description: c.description,
        credits: c.credits,
        prerequisiteExpression: c.prerequisiteExpression?.expression,
        prerequisiteNodes: c.prerequisiteNodes,
        sectionCount: c._count.sections
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch courses' })
  }
})

/**
 * GET /api/admin/courses/:courseId
 * Get single course with full details
 */
router.get('/courses/:courseId', async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params

    const course = await prisma.course.findUnique({
      where: { id: courseId.toUpperCase() },
      include: {
        prerequisiteExpression: true,
        prerequisiteNodes: {
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    if (!course) {
      return res.status(404).json({ error: 'Course not found' })
    }

    res.json({
      id: course.id,
      title: course.title,
      description: course.description,
      credits: course.credits,
      prerequisiteExpression: course.prerequisiteExpression?.expression,
      prerequisiteNodes: course.prerequisiteNodes
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch course' })
  }
})

/**
 * POST /api/admin/courses
 * Create a new course
 */
router.post('/courses', async (req: Request, res: Response) => {
  try {
    const { id, title, description, credits } = req.body

    if (!id) {
      return res.status(400).json({ error: 'Course ID is required' })
    }

    const courseId = id.toUpperCase().replace(/\s+/g, '')

    const existing = await prisma.course.findUnique({ where: { id: courseId } })
    if (existing) {
      return res.status(409).json({ error: 'Course already exists' })
    }

    const course = await prisma.course.create({
      data: {
        id: courseId,
        title: title || courseId,
        description: description || null,
        credits: credits || 0.5
      }
    })

    res.json({ success: true, course })
  } catch (error) {
    res.status(500).json({ error: 'Failed to create course' })
  }
})

/**
 * PUT /api/admin/courses/:courseId
 * Update course details
 */
router.put('/courses/:courseId', async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params
    const { title, description, credits } = req.body

    const course = await prisma.course.update({
      where: { id: courseId.toUpperCase() },
      data: {
        title,
        description,
        credits
      }
    })

    res.json({ success: true, course })
  } catch (error) {
    res.status(500).json({ error: 'Failed to update course' })
  }
})

/**
 * PUT /api/admin/courses/:courseId/prerequisites
 * Update course prerequisites with tree structure
 * 
 * Body: {
 *   expression: "COMP2401 && (SYSC2004 || SYSC2006)",
 *   nodes: [
 *     { nodeType: "AND", parentId: null },
 *     { nodeType: "COURSE", requiredCourseId: "COMP2401", parentId: "..." },
 *     ...
 *   ]
 * }
 */
router.put('/courses/:courseId/prerequisites', async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params
    const { expression, nodes } = req.body
    const normalizedId = courseId.toUpperCase()

    // Verify course exists
    const course = await prisma.course.findUnique({ where: { id: normalizedId } })
    if (!course) {
      return res.status(404).json({ error: 'Course not found' })
    }

    // Delete existing prerequisites
    await prisma.prerequisiteNode.deleteMany({ where: { courseId: normalizedId } })
    await prisma.prerequisite.deleteMany({ where: { courseId: normalizedId } })

    // Create new expression if provided
    if (expression) {
      await prisma.prerequisite.create({
        data: {
          courseId: normalizedId,
          expression
        }
      })
    }

    // Create new nodes if provided
    if (nodes && Array.isArray(nodes) && nodes.length > 0) {
      // First pass: create nodes with temporary IDs mapped
      const idMap = new Map<string, string>()
      
      // Create root nodes first (no parentId)
      for (const node of nodes) {
        if (!node.parentId) {
          const created = await prisma.prerequisiteNode.create({
            data: {
              courseId: normalizedId,
              nodeType: node.nodeType,
              requiredCourseId: node.requiredCourseId || null,
              requiredYear: node.requiredYear || null,
              requiredGrade: node.requiredGrade || null,
              parentId: null
            }
          })
          idMap.set(node.tempId || node.id, created.id)
        }
      }

      // Create child nodes
      for (const node of nodes) {
        if (node.parentId) {
          const parentDbId = idMap.get(node.parentId)
          const created = await prisma.prerequisiteNode.create({
            data: {
              courseId: normalizedId,
              nodeType: node.nodeType,
              requiredCourseId: node.requiredCourseId || null,
              requiredYear: node.requiredYear || null,
              requiredGrade: node.requiredGrade || null,
              parentId: parentDbId || null
            }
          })
          idMap.set(node.tempId || node.id, created.id)
        }
      }
    }

    // Fetch updated course
    const updated = await prisma.course.findUnique({
      where: { id: normalizedId },
      include: {
        prerequisiteExpression: true,
        prerequisiteNodes: { orderBy: { createdAt: 'asc' } }
      }
    })

    res.json({ success: true, course: updated })
  } catch (error) {
    console.error('Update prerequisites error:', error)
    res.status(500).json({ error: 'Failed to update prerequisites' })
  }
})

/**
 * DELETE /api/admin/courses/:courseId
 * Delete a course and all related data
 */
router.delete('/courses/:courseId', async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params
    const normalizedId = courseId.toUpperCase()

    // Delete in order: nodes, expression, sections, course
    await prisma.prerequisiteNode.deleteMany({ where: { courseId: normalizedId } })
    await prisma.prerequisite.deleteMany({ where: { courseId: normalizedId } })
    await prisma.section.deleteMany({ where: { courseId: normalizedId } })
    await prisma.course.delete({ where: { id: normalizedId } })

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete course' })
  }
})

/**
 * GET /api/admin/stats
 * Get admin dashboard statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const [courseCount, sectionCount, termStats] = await Promise.all([
      prisma.course.count(),
      prisma.section.count(),
      prisma.section.groupBy({
        by: ['term'],
        _count: { id: true },
        orderBy: { term: 'desc' },
        take: 5
      })
    ])

    res.json({
      courses: courseCount,
      sections: sectionCount,
      recentTerms: termStats.map(t => ({
        term: t.term,
        sections: t._count.id
      }))
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

export default router
