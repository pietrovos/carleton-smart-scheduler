import { PrismaClient } from '@prisma/client'
import fs from 'fs/promises'
import path from 'path'
import { ensureSectionMeetingsTable, insertSectionMeetings } from '../server/lib/section-meetings'

const prisma = new PrismaClient()

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
  
  // Skip invalid lines
  if (parts.length < 14) {
    return null
  }

  const [
    term,
    sectionId,
    department,
    courseNumber,
    sectionCode,
    sectionType,
    days,
    startTime,
    endTime,
    startDate,
    endDate,
    capacity,
    enrolled,
    status
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

async function main() {
  console.log('[SCHEDULE] Starting timetable data import...')
  await ensureSectionMeetingsTable(prisma)

  // Read the timetable file
  const timetablePath = path.join(process.cwd(), 'scheduling-timings.txt')
  const content = await fs.readFile(timetablePath, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim())

  console.log(`[STATS] Found ${lines.length} timetable records to process`)

  let imported = 0
  let skipped = 0

  for (const line of lines) {
    const record = parseTimetableLine(line)
    
    if (!record) {
      skipped++
      continue
    }

    const courseId = `${record.department}${record.courseNumber}`

    try {
      // Check if the course exists in our database
      const course = await prisma.course.findUnique({
        where: { id: courseId }
      })

      if (!course) {
        // Create the course if it doesn't exist
        await prisma.course.create({
          data: {
            id: courseId,
            title: courseId // Will be updated later with actual titles
          }
        })
      }

      // Create the section
      const section = await prisma.section.create({
        data: {
          crn: record.sectionId,
          courseId: courseId,
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

      if (imported % 100 === 0) {
        console.log(`[PROGRESS] Imported ${imported} sections...`)
      }

    } catch (error) {
      console.error(`[ERROR] Error importing section ${courseId}-${record.sectionCode}:`, error)
      skipped++
    }
  }

  console.log(`\n[SUCCESS] Timetable import completed!`)
  console.log(`[STATS] Imported: ${imported} sections`)
  console.log(`[WARNING]  Skipped: ${skipped} records`)

  // Show statistics
  const totalSections = await prisma.section.count()
  const uniqueCourses = await prisma.section.groupBy({
    by: ['courseId'],
    _count: true
  })

  console.log(`\n[PROGRESS] Database statistics:`)
  console.log(`[COURSES] Total sections: ${totalSections}`)
  console.log(`[TARGETS] Courses with sections: ${uniqueCourses.length}`)
}

main()
  .catch((e) => {
    console.error('[ERROR] Error importing timetable:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
