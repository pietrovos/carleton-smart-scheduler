import { PrismaClient } from '@prisma/client'
import fs from 'fs/promises'

const prisma = new PrismaClient()

// Department codes from our local course files
const DEPARTMENTS = [
  'ACSE', 'AERO', 'ARCC', 'ARCH', 'ARCN', 'BIOL', 'BIOM', 
  'CCDP', 'CDNS', 'CHEM', 'CIVE', 'COMP', 'COOP', 'CSEC',
  'ECON', 'ECOR', 'ELEC', 'ENVE', 'ERTH', 'ESLA', 'GEOG', 
  'GEOM', 'MAAE', 'MATH', 'MECH', 'MECT', 'PHYS', 'SREE', 
  'STAT', 'SYSC'
]

interface CourseData {
  title: string
  credits: number
  description: string
}

async function fetchCoursesFromDepartment(deptCode: string): Promise<Record<string, CourseData>> {
  const courses: Record<string, CourseData> = {}
  
  try {
    console.log(`[FETCH] Fetching courses from ${deptCode} department...`)
    
    // Fetch the department page from Carleton's calendar
    const response = await fetch(`https://calendar.carleton.ca/undergrad/courses/${deptCode}/`)
    
    if (!response.ok) {
      console.log(`[WARNING] Failed to fetch ${deptCode}: ${response.status}`)
      return courses
    }
    
    const html = await response.text()
    
    // Parse course blocks from HTML - they are in <div class="courseblock"> elements
    const courseBlockRegex = /<div class="courseblock">([\s\S]*?)<\/div>/g
    
    let courseBlockMatch: RegExpExecArray | null
    let count = 0
    
    while ((courseBlockMatch = courseBlockRegex.exec(html)) !== null) {
      const courseBlockContent = courseBlockMatch[1]
      
      // Extract course code and credit
      const courseHeaderRegex = /<span class="courseblockcode">([A-Z]{2,5})&#160;(\d{4})<\/span>\s+\[([0-9.]+)\s+credit[s]?\]<br\/>\s*([^<]+)<\/span>/
      const headerMatch = courseHeaderRegex.exec(courseBlockContent)
      
      if (headerMatch) {
        const [, dept, courseNum, creditsStr, title] = headerMatch
        const courseId = `${dept}${courseNum}`
        const credits = parseFloat(creditsStr)
        
        // Extract description - it's the first text after the title
        const descriptionRegex = /<\/span><\/strong><br\/>\s*([^<]+)/
        const descMatch = descriptionRegex.exec(courseBlockContent)
        let description = ''
        
        if (descMatch) {
          description = descMatch[1].trim()
        } else {
          // Fallback - just use the title as description
          description = title.trim()
        }
        
        courses[courseId] = {
          title: title.trim(),
          credits,
          description
        }
        
        count++
      }
    }
    
    console.log(`[SUCCESS] Found ${count} courses in ${deptCode}`)
    
  } catch (error) {
    console.error(`[ERROR] Failed to fetch ${deptCode}:`, error)
  }
  
  return courses
}

async function main() {
  console.log('[FETCH] Starting comprehensive course title extraction...')
  console.log(`[INFO] Will fetch from ${DEPARTMENTS.length} departments`)
  
  const allCourses: Record<string, CourseData> = {}
  let totalCourses = 0
  
  // Process departments in batches to avoid overwhelming the server
  const BATCH_SIZE = 3
  
  for (let i = 0; i < DEPARTMENTS.length; i += BATCH_SIZE) {
    const batch = DEPARTMENTS.slice(i, i + BATCH_SIZE)
    console.log(`\n[BATCH] Processing departments: ${batch.join(', ')}`)
    
    // Process batch in parallel
    const batchPromises = batch.map(dept => fetchCoursesFromDepartment(dept))
    const batchResults = await Promise.all(batchPromises)
    
    // Merge results
    batchResults.forEach((deptCourses, index) => {
      Object.assign(allCourses, deptCourses)
      totalCourses += Object.keys(deptCourses).length
    })
    
    // Be respectful - add delay between batches
    if (i + BATCH_SIZE < DEPARTMENTS.length) {
      console.log('[INFO] Waiting 2 seconds before next batch...')
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
  
  // Save to JSON file
  const jsonOutput = {
    fetchedAt: new Date().toISOString(),
    totalCourses,
    departments: DEPARTMENTS,
    courses: allCourses
  }
  
  await fs.writeFile('course_titles.json', JSON.stringify(jsonOutput, null, 2))
  
  console.log(`\n[SUCCESS] Course title extraction completed!`)
  console.log(`[STATS] Total courses found: ${totalCourses}`)
  console.log(`[STATS] Departments processed: ${DEPARTMENTS.length}`)
  console.log(`[OUTPUT] Saved to: course_titles.json`)
  
  // Show sample of fetched courses
  const sampleCourses = Object.entries(allCourses).slice(0, 5)
  console.log(`\n[SAMPLE] Fetched course titles:`)
  sampleCourses.forEach(([courseId, courseData]) => {
    console.log(`  ${courseId}: ${courseData.title} (${courseData.credits} credits)`)
  })
  
  // Check our database to see which courses we have vs what we fetched
  const dbCourses = await prisma.course.findMany({
    select: { id: true }
  })
  
  const dbCourseIds = new Set(dbCourses.map(c => c.id))
  const fetchedCourseIds = new Set(Object.keys(allCourses))
  
  const matchedCourses = [...dbCourseIds].filter(id => fetchedCourseIds.has(id))
  const missingTitles = [...dbCourseIds].filter(id => !fetchedCourseIds.has(id))
  
  console.log(`\n[ANALYSIS] Database vs Fetched:`)
  console.log(`  Database courses: ${dbCourseIds.size}`)
  console.log(`  Fetched courses: ${fetchedCourseIds.size}`)
  console.log(`  Matched courses: ${matchedCourses.length}`)
  console.log(`  Missing titles: ${missingTitles.length}`)
  
  if (missingTitles.length > 0) {
    console.log(`\n[MISSING] Courses in DB without fetched titles (first 10):`)
    missingTitles.slice(0, 10).forEach(courseId => {
      console.log(`  ${courseId}`)
    })
  }
}

main()
  .catch((e) => {
    console.error('[ERROR] Failed to fetch course titles:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
