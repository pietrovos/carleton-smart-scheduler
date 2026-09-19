import { PrismaClient } from '@prisma/client'
import { promises as fs } from 'fs'
import * as path from 'path'
import { ELECTIVE_CATEGORIES } from '../cli/elective-mappings'
import { ensureSectionMeetingsTable, insertSectionMeetings } from '../server/lib/section-meetings'

const prisma = new PrismaClient()

const ELECTIVE_CATEGORY_SEED: Record<string, { label: string }> = {
  CS_ELECTIVE: { label: 'Computer Science Elective' },
  SCIENCE_ELECTIVE: { label: 'Basic Science Elective' },
  COMPLEMENTARY_STUDIES: { label: 'Complementary Studies' }
}

// Enhanced course data interface
interface CourseEntry {
  required: string | null
  restricted: string[]
  title?: string
  credits?: number
  description?: string
}

interface SectionMeetingSeed {
  days: string | null
  startTime: string | null
  endTime: string | null
  roomCapacity: number | null
}

interface SectionSeed {
  crn: string
  courseId: string
  sectionCode: string
  sectionType: string
  term: string
  meetings: SectionMeetingSeed[]
}

// Prerequisite expression parser
interface ParsedNode {
  type: 'AND' | 'OR' | 'COURSE' | 'YEAR_STANDING' | 'PERMISSION'
  value?: string
  grade?: string
  children?: ParsedNode[]
}

function parsePrerequisiteExpression(expression: string): ParsedNode {
  // Remove extra whitespace
  expression = expression.trim()
  
  // Handle simple cases first
  if (expression.includes(' && ') && !expression.includes(' || ')) {
    // Simple AND
    const parts = expression.split(' && ').map(p => p.trim())
    return {
      type: 'AND',
      children: parts.map(part => parseSimpleTerm(part))
    }
  }
  
  if (expression.includes(' || ') && !expression.includes(' && ')) {
    // Simple OR
    const parts = expression.split(' || ').map(p => p.trim())
    return {
      type: 'OR', 
      children: parts.map(part => parseSimpleTerm(part))
    }
  }
  
  // Handle parentheses - for now, simplified parsing
  if (expression.includes('(') && expression.includes(')')) {
    // Complex expression with parentheses
    return parseComplexExpression(expression)
  }
  
  // Single term
  return parseSimpleTerm(expression)
}

function parseSimpleTerm(term: string): ParsedNode {
  term = term.trim().replace(/[()]/g, '')
  
  // Handle special requirement types
  if (term === 'FIRST_YEAR' || term === 'SECOND_YEAR' || term === 'THIRD_YEAR' || term === 'FOURTH_YEAR') {
    return { type: 'YEAR_STANDING', value: term }
  }
  
  if (term === 'PERMISSION') {
    return { type: 'PERMISSION' }
  }
  
  // Handle special non-course requirements
  if (term === 'OTHER_REQUIREMENT' || term === 'HIGH_SCHOOL_REQUIREMENT' || term.startsWith('PROGRAM_')) {
    return { type: 'PERMISSION' } // Treat these as permission-based requirements
  }
  
  // Handle course codes with grade requirements (e.g., "COMP1006[C-]")
  const gradeMatch = term.match(/^([A-Z]{3,4}\d{4})\[([A-Z\-+]*)\]$/)
  if (gradeMatch) {
    const courseCode = gradeMatch[1]
    const gradeRequirement = gradeMatch[2]
    return { type: 'COURSE', value: courseCode, grade: gradeRequirement }
  }
  
  // Handle standard course codes (but exclude MATH0005/MATH0006 which are prep courses)
  if (term.match(/^[A-Z]{3,4}\d{4}$/) && !term.match(/^MATH000[56]$/)) {
    return { type: 'COURSE', value: term }
  }
  
  // Handle prep courses or other special terms as permission requirements
  if (term.match(/^MATH000[56]$/) || term.includes('_REQUIREMENT')) {
    return { type: 'PERMISSION' }
  }
  
  // Fallback - treat unknown terms as permission requirements to avoid FK issues
  console.log(`WARNING: Unknown term treated as PERMISSION: ${term}`)
  return { type: 'PERMISSION' }
}

function parseComplexExpression(expression: string): ParsedNode {
  // Simplified parser for basic cases like "(A || B) && (C || D)"
  // This handles the most common patterns in our dataset
  
  // Split on && first (lower precedence)
  if (expression.includes(' && ')) {
    const andParts = splitOnTopLevelOperator(expression, ' && ')
    if (andParts.length > 1) {
      return {
        type: 'AND',
        children: andParts.map(part => parsePrerequisiteExpression(part.trim()))
      }
    }
  }
  
  // Split on || 
  if (expression.includes(' || ')) {
    const orParts = splitOnTopLevelOperator(expression, ' || ')
    if (orParts.length > 1) {
      return {
        type: 'OR',
        children: orParts.map(part => parsePrerequisiteExpression(part.trim()))
      }
    }
  }
  
  // Remove outer parentheses and try again
  if (expression.startsWith('(') && expression.endsWith(')')) {
    return parsePrerequisiteExpression(expression.slice(1, -1))
  }
  
  return parseSimpleTerm(expression)
}

function splitOnTopLevelOperator(expression: string, operator: string): string[] {
  const parts: string[] = []
  let current = ''
  let parenDepth = 0
  let i = 0
  
  while (i < expression.length) {
    const char = expression[i]
    
    if (char === '(') {
      parenDepth++
      current += char
    } else if (char === ')') {
      parenDepth--
      current += char
    } else if (parenDepth === 0 && expression.slice(i, i + operator.length) === operator) {
      parts.push(current.trim())
      current = ''
      i += operator.length - 1
    } else {
      current += char
    }
    
    i++
  }
  
  if (current.trim()) {
    parts.push(current.trim())
  }
  
  return parts.length > 1 ? parts : [expression]
}

async function createPrerequisiteTree(courseId: string, parsedNode: ParsedNode, parentId?: string): Promise<string> {
  const node = await prisma.prerequisiteNode.create({
    data: {
      courseId,
      nodeType: parsedNode.type,
      requiredCourseId: parsedNode.type === 'COURSE' ? parsedNode.value : null,
      requiredYear: parsedNode.type === 'YEAR_STANDING' ? parsedNode.value : null,
      requiredGrade: parsedNode.type === 'COURSE' && parsedNode.grade ? parsedNode.grade : null,
      parentId: parentId || null
    }
  })
  
  // Create child nodes if they exist
  if (parsedNode.children) {
    for (const child of parsedNode.children) {
      await createPrerequisiteTree(courseId, child, node.id)
    }
  }
  
  return node.id
}

// Helper function to extract all course codes from a prerequisite expression
function extractCourseCodesFromExpression(expression: string): string[] {
  const coursePattern = /\b[A-Z]{3,4}\d{4}\b/g
  return expression.match(coursePattern) || []
}

async function resolveScheduleCsvPath(): Promise<string> {
  for (const fileName of ['Sched.csv', 'sched.csv']) {
    const fullPath = path.join(process.cwd(), fileName)
    try {
      await fs.access(fullPath)
      return fullPath
    } catch {
      continue
    }
  }

  throw new Error('Sched.csv not found in project root')
}

function mapScheduleTermLabel(termLabel: string): string {
  const normalized = termLabel.trim().toLowerCase()

  // This dataset contains Fall 2025 and Winter 2026.
  if (normalized === 'fall') return '202530'
  if (normalized === 'winter') return '202610'

  throw new Error(`Unsupported schedule term label: ${termLabel}`)
}

function parseScheduleCsv(content: string): SectionSeed[] {
  const lines = content.split(/\r?\n/).filter(line => line.trim())
  if (lines.length <= 1) return []

  const header = lines[0].split('\t')
  const expectedHeader = ['TERM', 'CRN', 'SUBJ', 'CRSE', 'SECT', 'INSTR_TYPE', 'DAYS', 'START_TIME', 'END_TIME', 'ROOM_CAP']
  if (header.join('\t') !== expectedHeader.join('\t')) {
    throw new Error(`Unexpected Sched.csv header: ${header.join(', ')}`)
  }

  const groupedSections = new Map<string, SectionSeed>()

  for (const line of lines.slice(1)) {
    const parts = line.split('\t')
    if (parts.length < 10) continue

    const [
      termLabel,
      crn,
      department,
      courseNumber,
      sectionCode,
      sectionType,
      days,
      startTime,
      endTime,
      roomCapacity
    ] = parts

    const normalizedTerm = mapScheduleTermLabel(termLabel)
    const courseId = `${department}${courseNumber}`
    const sectionKey = [normalizedTerm, crn, courseId, sectionCode, sectionType].join('|')

    const meeting: SectionMeetingSeed = {
      days: days || null,
      startTime: startTime ? startTime.padStart(4, '0') : null,
      endTime: endTime ? endTime.padStart(4, '0') : null,
      roomCapacity: roomCapacity ? parseInt(roomCapacity, 10) || null : null
    }

    const existingSection = groupedSections.get(sectionKey)
    if (!existingSection) {
      groupedSections.set(sectionKey, {
        crn,
        courseId,
        sectionCode,
        sectionType,
        term: normalizedTerm,
        meetings: meeting.days || meeting.startTime || meeting.endTime || meeting.roomCapacity !== null
          ? [meeting]
          : []
      })
      continue
    }

    const alreadySeenMeeting = existingSection.meetings.some(existing =>
      existing.days === meeting.days &&
      existing.startTime === meeting.startTime &&
      existing.endTime === meeting.endTime &&
      existing.roomCapacity === meeting.roomCapacity
    )

    if (!alreadySeenMeeting && (meeting.days || meeting.startTime || meeting.endTime || meeting.roomCapacity !== null)) {
      existingSection.meetings.push(meeting)
    }
  }

  return Array.from(groupedSections.values())
}

async function main() {
  console.log('[SEED] Starting database seed...')

  // Read the enhanced prerequisites JSON file
  const prerequisitesPath = path.join(process.cwd(), 'course_prerequisites_simple.json')
  const prerequisitesData: Record<string, CourseEntry> = JSON.parse(await fs.readFile(prerequisitesPath, 'utf-8'))
  const scheduleCsvPath = await resolveScheduleCsvPath()
  const scheduleSections = parseScheduleCsv(await fs.readFile(scheduleCsvPath, 'utf-8'))

  console.log(`[COURSES] Found ${Object.keys(prerequisitesData).length} courses with enhanced data`)
  console.log(`[SCHEDULE] Found ${scheduleSections.length} normalized sections in ${path.basename(scheduleCsvPath)}`)

  // PASS 1: Collect all unique course codes mentioned in prerequisites
  console.log('[SEARCH] Pass 1: Collecting all referenced courses...')
  const allReferencedCourses = new Set<string>()
  
  for (const [courseId, courseEntry] of Object.entries(prerequisitesData)) {
    // Add the main course
    allReferencedCourses.add(courseId)
    
    // Extract prerequisite courses from the expression
    if (courseEntry.required) {
      const prereqCourses = extractCourseCodesFromExpression(courseEntry.required)
      prereqCourses.forEach(course => allReferencedCourses.add(course))
    }
  }

  for (const section of scheduleSections) {
    allReferencedCourses.add(section.courseId)
  }
  
  console.log(`[LIST] Found ${allReferencedCourses.size} unique courses to create`)
  
  // Create all Course records first to satisfy foreign key constraints
  console.log('[CREATE] Creating Course records...')
  let coursesCreated = 0
  let titledCourses = 0
  
  for (const courseId of Array.from(allReferencedCourses)) {
    try {
      const courseEntry = prerequisitesData[courseId]
      
      await prisma.course.upsert({
        where: { id: courseId },
        update: {
          updatedAt: new Date(),
          // Update title/description if we have enhanced data
          ...(courseEntry?.title && courseEntry.title !== courseId ? { 
            title: courseEntry.title,
            description: courseEntry.description,
            credits: courseEntry.credits
          } : {})
        },
        create: {
          id: courseId,
          title: courseEntry?.title || courseId,
          description: courseEntry?.description || null,
          credits: courseEntry?.credits || null
        }
      })
      
      coursesCreated++
      if (courseEntry?.title && courseEntry.title !== courseId) {
        titledCourses++
      }
    } catch (error) {
      console.log(`[ERROR] Error creating course ${courseId}:`, error)
    }
  }
  
  console.log(`[SUCCESS] Created ${coursesCreated} course records`)
  console.log(`[TITLES] ${titledCourses} courses have proper titles`)

  // PASS 2: Create prerequisites and parse trees
  console.log('[TREE] Pass 2: Creating prerequisite expressions and trees...')
  let successCount = 0
  let errorCount = 0

  for (const [courseId, courseEntry] of Object.entries(prerequisitesData)) {
    try {
      // Create prerequisite if it exists
      if (courseEntry.required) {
        // Store the human-readable expression
        await prisma.prerequisite.upsert({
          where: { courseId },
          update: {
            expression: courseEntry.required,
            lastModified: new Date()
          },
          create: {
            courseId: courseId,
            expression: courseEntry.required,
          }
        })

        // Parse and create tree structure
        try {
          // Clear existing nodes for this course
          await prisma.prerequisiteNode.deleteMany({
            where: { courseId }
          })
          
          const parsedTree = parsePrerequisiteExpression(courseEntry.required)
          await createPrerequisiteTree(courseId, parsedTree)
          
          successCount++
        } catch (parseError) {
          console.log(`[WARNING] Failed to parse prerequisites for ${courseId}: ${courseEntry.required}`)
          console.log(`   Error: ${parseError}`)
          errorCount++
        }
      } else {
        successCount++
      }
    } catch (error) {
      console.log(`[ERROR] Error processing course ${courseId}:`, error)
      errorCount++
    }
  }

  console.log(`[SUCCESS] Database seeded successfully!`)
  console.log(`   Successfully processed: ${successCount} courses`)
  if (errorCount > 0) {
    console.log(`   Parsing errors: ${errorCount} courses`)
  }

  // PASS 3: Backfill titles from course_titles.json for any course still
  // using its code as the title (e.g. courses created by import-timetable
  // that weren't in course_prerequisites_simple.json).
  console.log('[TITLES] Pass 3: Backfilling titles from course_titles.json...')
  const titlesPath = path.join(process.cwd(), 'course_titles.json')
  let titlesBackfilled = 0
  try {
    const titlesFile: { courses: Record<string, { title: string; credits: number; description: string }> } =
      JSON.parse(await fs.readFile(titlesPath, 'utf-8'))

    // Find all courses whose title still equals their id (the placeholder)
    const coursesNeedingTitles = await prisma.course.findMany({
      select: { id: true, title: true }
    })

    for (const course of coursesNeedingTitles) {
      // Only update if the title is the course code (placeholder) or null
      if (course.title && course.title !== course.id) continue

      const titleEntry = titlesFile.courses[course.id]
      if (!titleEntry) continue

      await prisma.course.update({
        where: { id: course.id },
        data: {
          title: titleEntry.title,
          description: titleEntry.description || null,
          credits: titleEntry.credits || null
        }
      })
      titlesBackfilled++
    }

    console.log(`[TITLES] Backfilled ${titlesBackfilled} course titles from course_titles.json`)
  } catch (err) {
    console.log(`[WARNING] Could not backfill titles from course_titles.json: ${err}`)
  }

  console.log('\n[SCHEDULE] Rebuilding section and meeting data from Sched.csv...')
  await ensureSectionMeetingsTable(prisma)
  await prisma.section.deleteMany({})

  let sectionsCreated = 0
  let meetingsCreated = 0

  for (const section of scheduleSections) {
    const createdSection = await prisma.section.create({
      data: {
        crn: section.crn,
        courseId: section.courseId,
        sectionCode: section.sectionCode,
        sectionType: section.sectionType,
        term: section.term
      }
    })

    await insertSectionMeetings(
      prisma,
      createdSection.id,
      section.meetings.map(meeting => ({
        days: meeting.days,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        startDate: null,
        endDate: null,
        roomCapacity: meeting.roomCapacity
      }))
    )

    sectionsCreated++
    meetingsCreated += section.meetings.length
  }

  console.log(`[SCHEDULE] Seeded ${sectionsCreated} sections and ${meetingsCreated} meeting rows`)
  
  // Show statistics about course titles
  const coursesWithTitles = await prisma.course.count({
    where: {
      NOT: {
        title: { equals: prisma.course.fields.id }
      }
    }
  })
  
  const totalCourses = await prisma.course.count()
  
  console.log(`\n[FINAL STATS] Course title coverage:`)
  console.log(`   Total courses in database: ${totalCourses}`)
  console.log(`   Courses with proper titles: ${coursesWithTitles}`)
  console.log(`   Coverage: ${((coursesWithTitles / totalCourses) * 100).toFixed(1)}%`)

  console.log('\n[ELECTIVES] Syncing elective categories...')
  let electiveCourseLinks = 0
  const activeElectiveCategoryIds = Object.keys(ELECTIVE_CATEGORIES)

  await prisma.electiveCourse.deleteMany({
    where: {
      categoryId: {
        notIn: activeElectiveCategoryIds
      }
    }
  })

  await prisma.electiveCategory.deleteMany({
    where: {
      id: {
        notIn: activeElectiveCategoryIds
      }
    }
  })

  for (const [categoryId, courseIds] of Object.entries(ELECTIVE_CATEGORIES)) {
    const metadata = ELECTIVE_CATEGORY_SEED[categoryId] || {
      label: categoryId
    }

    await prisma.electiveCategory.upsert({
      where: { id: categoryId },
      update: {
        label: metadata.label
      },
      create: {
        id: categoryId,
        label: metadata.label
      }
    })

    await prisma.electiveCourse.deleteMany({
      where: { categoryId }
    })

    const existingCourses = await prisma.course.findMany({
      where: {
        id: {
          in: courseIds
        }
      },
      select: {
        id: true
      }
    })

    if (existingCourses.length === 0) {
      continue
    }

    await prisma.electiveCourse.createMany({
      data: existingCourses.map(course => ({
        categoryId,
        courseId: course.id
      })),
      skipDuplicates: true
    })

    electiveCourseLinks += existingCourses.length
  }

  console.log(`[ELECTIVES] Synced ${Object.keys(ELECTIVE_CATEGORIES).length} categories and ${electiveCourseLinks} course links`)
}

main()
  .catch((e) => {
    console.error('[ERROR] Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
