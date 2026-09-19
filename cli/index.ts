#!/usr/bin/env node

import { PrismaClient } from '@prisma/client'
import * as readline from 'readline'
import { validatePrerequisites, getPrerequisiteExplanation, StudentTranscript } from './prerequisite-validator'
import { ingestAuditFromFile } from './audit-parser'
import { fetchSectionMeetings, SectionMeetingRecord } from '../server/lib/section-meetings'

const prisma = new PrismaClient()

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function question(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve))
}

async function showHelp() {
  console.log(`
Smart Scheduler CLI Commands:

1. search <course_code>     - Search for a course (e.g., search SYSC4907)
2. prereq <course_code>     - Show prerequisites for a course
3. sections <course_code>   - Show all sections for a course with times
4. validate <course> <completed_courses> [year] [permission] - Check if prerequisites are met
5. ingest <file_path>       - Import student audit data from HTML file
6. student <student_id>     - Show student's completed courses
7. eligible <student_id>    - Show courses student is eligible to take
8. stats                   - Show database statistics
9. help                    - Show this help
10. exit                   - Exit the CLI

Examples:
  search SYSC
  prereq SYSC4907
  sections SYSC4907
  validate SYSC4907 "SYSC1006,SYSC2006,SYSC4001"
  ingest safi-audit.txt
  student 101000001
  eligible 101000001
`)
}

async function searchCourses(searchTerm: string) {
  const courses = await prisma.course.findMany({
    where: {
      id: {
        contains: searchTerm.toUpperCase(),
        mode: 'insensitive'
      }
    },
    include: {
      prerequisiteExpression: true,
      sections: true
    },
    // take: 50
  })

  if (courses.length === 0) {
    console.log(`No courses found matching "${searchTerm}"`)
    return
  }

  console.log(`\nFound ${courses.length} course(s) matching "${searchTerm}":`)
  courses.forEach(course => {
    console.log(`\n${course.id} - ${course.title || 'No title available'}`)
    if (course.prerequisiteExpression) {
      console.log(`   Prerequisites: ${course.prerequisiteExpression.expression}`)
    }
    if (course.sections.length > 0) {
      console.log(`   Sections: ${course.sections.length} available`)
    }
  })
}

async function showPrerequisites(courseCode: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseCode.toUpperCase() },
    include: { prerequisiteExpression: true }
  })

  if (!course) {
    console.log(`[ERROR] Course ${courseCode} not found`)
    return
  }

  console.log(`\n[COURSE] ${course.id} - ${course.title || 'No title available'}`)
  
  if (!course.prerequisiteExpression) {
    console.log('[PASS] No prerequisites required')
    return
  }

  console.log(`Prerequisites: ${course.prerequisiteExpression.expression}`)
  console.log(`Last updated: ${course.prerequisiteExpression.lastModified.toDateString()}`)
}

async function validateCoursePrerequisites(courseCode: string, completedCoursesStr: string, yearStr?: string, permissionStr?: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseCode.toUpperCase() }
  })

  if (!course) {
    console.log(`[ERROR] Course ${courseCode} not found`)
    return
  }

  // Parse completed courses and grades
  const coursesWithGrades = completedCoursesStr.split(',').map(c => c.trim()).filter(c => c)
  const completedCourses: string[] = []
  const courseGrades: { [courseId: string]: string } = {}
  
  coursesWithGrades.forEach(courseStr => {
    // Handle courses with grades like "COMP1006[B+]"
    const gradeMatch = courseStr.match(/^([A-Z]{3,4}\d{4})\[([A-Z\-+]*)\]$/i)
    if (gradeMatch) {
      const courseCode = gradeMatch[1].toUpperCase()
      const grade = gradeMatch[2].toUpperCase()
      completedCourses.push(courseCode)
      courseGrades[courseCode] = grade
    } else {
      // Handle courses without grades like "COMP1006"
      const courseCode = courseStr.toUpperCase()
      if (courseCode.match(/^[A-Z]{3,4}\d{4}$/)) {
        completedCourses.push(courseCode)
      }
    }
  })
  
  // Parse year standing
  const yearStandings = ['FIRST_YEAR', 'SECOND_YEAR', 'THIRD_YEAR', 'FOURTH_YEAR']
  let currentYear: StudentTranscript['currentYear'] = 'FIRST_YEAR'
  
  if (yearStr) {
    const normalizedYear = yearStr.toUpperCase()
    if (yearStandings.includes(normalizedYear)) {
      currentYear = normalizedYear as StudentTranscript['currentYear']
    } else {
      console.log(`Invalid year standing "${yearStr}". Using FIRST_YEAR. Valid options: ${yearStandings.join(', ')}`)
    }
  }
  
  // Parse permission
  const hasSpecialPermission = permissionStr?.toLowerCase() === 'true' || permissionStr?.toLowerCase() === 'yes'

  const transcript: StudentTranscript = {
    completedCourses,
    courseGrades, 
    currentYear,
    hasSpecialPermission
  }

  console.log(`\n[COURSE] Validating prerequisites for ${course.id}`)
  console.log(`Your completed courses: ${completedCourses.join(', ')}`)
  console.log(`Current year standing: ${currentYear}`)
  console.log(`Special permission: ${hasSpecialPermission ? 'Yes' : 'No'}`)
  
  const explanation = await getPrerequisiteExplanation(courseCode.toUpperCase(), transcript)
  console.log(`\n${explanation}`)
}

async function showSections(courseCode: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseCode.toUpperCase() }
  })

  if (!course) {
    console.log(`[ERROR] Course ${courseCode} not found`)
    return
  }

  console.log(`\n[COURSE] ${course.id} - ${course.title || 'No title available'}`)
  
  const sections = await prisma.section.findMany({
    where: { courseId: course.id },
    orderBy: [
      { sectionType: 'asc' },
      { sectionCode: 'asc' }
    ]
  })

  const meetingsBySection = await fetchSectionMeetings(prisma, sections.map(section => section.id))
  const sectionsWithMeetings = sections.map(section => ({
    ...section,
    meetings: meetingsBySection.get(section.id) || []
  }))

  if (sectionsWithMeetings.length === 0) {
    console.log('[ERROR] No sections available for this course')
    return
  }

  console.log(`\nAvailable Sections Available Sections (${sectionsWithMeetings.length} total):\n`)
  
  // Group sections by type for better display
  const sectionsByType = sectionsWithMeetings.reduce((acc, section) => {
    if (!acc[section.sectionType]) {
      acc[section.sectionType] = []
    }
    acc[section.sectionType].push(section)
    return acc
  }, {} as Record<string, any[]>)

  Object.entries(sectionsByType).forEach(([type, sections]) => {
    console.log(` ${type} Sections:`)
    sections.forEach(section => {
      const enrollmentStr = section.capacity && section.enrolled !== null
        ? `${section.enrolled}/${section.capacity}`
        : 'N/A'

      const meetingSummary = section.meetings.length > 0
        ? section.meetings.map((meeting: SectionMeetingRecord) => {
            const timeStr = meeting.startTime && meeting.endTime
              ? `${formatTime(meeting.startTime)}-${formatTime(meeting.endTime)}`
              : 'TBA'

            return `${meeting.days || 'TBA'} ${timeStr}`
          }).join(' | ')
        : 'TBA'

      console.log(`   ${section.sectionCode}: ${meetingSummary}`)
      console.log(`      Enrollment: ${enrollmentStr} | Term: ${section.term || 'N/A'} | Status: ${section.status || 'N/A'}`)
      if (section.instructor) {
        console.log(`      Instructor: ${section.instructor}`)
      }
    })
    console.log('')
  })
}

function formatTime(timeStr: string): string {
  // Convert "0835" to "8:35 AM"
  if (!timeStr || timeStr.length !== 4) return timeStr
  
  const hour = parseInt(timeStr.substring(0, 2))
  const minute = timeStr.substring(2, 4)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour)
  
  return `${displayHour}:${minute} ${ampm}`
}

async function showStats() {
  const courseCount = await prisma.course.count()
  const prereqCount = await prisma.prerequisite.count()
  const nodeCount = await prisma.prerequisiteNode.count()
  const sectionCount = await prisma.section.count()

  console.log(`\nDatabase Statistics:`)
  console.log(`Courses: ${courseCount}`)
  console.log(`Prerequisite Expressions: ${prereqCount}`)
  console.log(`Prerequisite Tree Nodes: ${nodeCount}`)
  console.log(`Sections: ${sectionCount}`)
}

async function showStudent(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { studentId: studentId },
    include: { courseCompletions: { include: { course: true } } }
  })

  if (!student) {
    console.log(`[ERROR] Student ${studentId} not found`)
    return
  }

  console.log(`\n[STUDENT] ${student.name} (${student.studentId})`)
  console.log(`Program: ${student.program}`)
  console.log(`\nCompleted Courses (${student.courseCompletions.length} total):`)
  
  student.courseCompletions.forEach(completion => {
    console.log(`  ${completion.courseId} - ${completion.grade} - ${completion.course.title || 'No title'}`)
  })
}

async function showEligibleCourses(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { studentId: studentId },
    include: { courseCompletions: true }
  })

  if (!student) {
    console.log(`[ERROR] Student ${studentId} not found`)
    return
  }

  // Get completed course IDs
  const completedCourseIds = student.courseCompletions.map(c => c.courseId)
  
  console.log(`\n[ELIGIBLE COURSES] Checking prerequisites for ${student.name}`)
  console.log(`Completed courses: ${completedCourseIds.join(', ')}`)

  // Create transcript for validation
  const transcript: StudentTranscript = {
    completedCourses: completedCourseIds,
    courseGrades: Object.fromEntries(
      student.courseCompletions.map(c => [c.courseId, c.grade])
    ),
    currentYear: 'FOURTH_YEAR', // Default for now
    hasSpecialPermission: false
  }

  // Get all courses and check which ones they can take
  const allCourses = await prisma.course.findMany({
    where: {
      prerequisiteExpression: {
        isNot: null
      }
    },
    // take: 50 // Limit for demo
  })

  console.log(`\nChecking eligibility for ${allCourses.length} courses with prerequisites:\n`)

  for (const course of allCourses) {
    // Skip if already completed
    if (completedCourseIds.includes(course.id)) {
      continue
    }

    try {
      const isEligible = await validatePrerequisites(course.id, transcript)
      if (isEligible) {
        console.log(`✓ ${course.id} - ${course.title || 'No title'} - ELIGIBLE`)
      }
    } catch (error) {
      // Skip courses with validation errors
    }
  }
}

async function main() {
  console.log('Type "help" for available commands or "exit" to quit.\n')

  while (true) {
    try {
      const input = await question('smart-scheduler> ')
      const [command, ...args] = input.trim().split(' ')

      switch (command.toLowerCase()) {
        case 'help':
          await showHelp()
          break
        
        case 'search':
          if (args.length === 0) {
            console.log('[ERROR] Usage: search <course_code>')
            break
          }
          await searchCourses(args.join(' '))
          break
        
        case 'prereq':
          if (args.length === 0) {
            console.log('[ERROR] Usage: prereq <course_code>')
            break
          }
          await showPrerequisites(args[0])
          break
        
        case 'sections':
          if (args.length === 0) {
            console.log('[ERROR] Usage: sections <course_code>')
            break
          }
          await showSections(args[0])
          break
        
        case 'validate':
          if (args.length < 2) {
            console.log('[ERROR] Usage: validate <course> <completed_courses> [year] [permission]')
            console.log('   Example: validate SYSC4907 "SYSC1006,SYSC2006,SYSC4001"')
            console.log('   Example: validate SYSC4907 "SYSC1006,SYSC2006,SYSC4001" FOURTH_YEAR')
            console.log('   Example: validate CIVE4302 "CIVE3203,CIVE3206" FOURTH_YEAR true')
            break
          }
          await validateCoursePrerequisites(
            args[0], 
            args[1].replace(/"/g, ''),
            args[2],
            args[3]
          )
          break
        
        case 'stats':
          await showStats()
          break
        
        case 'ingest':
          if (args.length === 0) {
            console.log('[ERROR] Usage: ingest <file_path>')
            break
          }
          try {
            await ingestAuditFromFile(args[0])
          } catch (error) {
            console.log(`[ERROR] Failed to ingest audit: ${error}`)
          }
          break

        case 'student':
          if (args.length === 0) {
            console.log('[ERROR] Usage: student <student_id>')
            break
          }
          await showStudent(args[0])
          break

        case 'eligible':
          if (args.length === 0) {
            console.log('[ERROR] Usage: eligible <student_id>')
            break
          }
          await showEligibleCourses(args[0])
          break
        
        case 'exit':
        case 'quit':
          console.log('Goodbye! Goodbye!')
          rl.close()
          await prisma.$disconnect()
          process.exit(0)
        
        case '':
          // Empty command, do nothing
          break
        
        default:
          console.log(`[ERROR] Unknown command: ${command}`)
          console.log('Type "help" for available commands.')
          break
      }
    } catch (error) {
      console.error('[ERROR] Error:', error)
    }
  }
}

main().catch(console.error)
