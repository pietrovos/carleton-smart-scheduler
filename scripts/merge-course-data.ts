import fs from 'fs/promises'
import path from 'path'

interface CourseData {
  title: string
  credits: number
  description: string
}

interface CourseTitlesFile {
  courses: Record<string, CourseData>
}

interface PrerequisiteEntry {
  required: string | null
  restricted: string[]
  // New fields we'll add:
  title?: string
  credits?: number
  description?: string
}

async function main() {
  console.log('[MERGE] Starting course data merge...')
  
  // Load the course titles data
  console.log('[LOAD] Loading course titles from course_titles.json...')
  const courseTitlesPath = path.join(process.cwd(), 'course_titles.json')
  const prerequisitesPath = path.join(process.cwd(), 'course_prerequisites_simple.json')
  const courseTitlesContent = await fs.readFile(courseTitlesPath, 'utf-8')
  const courseTitlesData: CourseTitlesFile = JSON.parse(courseTitlesContent)
  
  console.log(`[LOAD] Found ${Object.keys(courseTitlesData.courses).length} course titles`)
  
  // Load the prerequisites data
  console.log('[LOAD] Loading prerequisites from course_prerequisites_simple.json...')
  const prerequisitesContent = await fs.readFile(prerequisitesPath, 'utf-8')
  const prerequisitesData: Record<string, PrerequisiteEntry> = JSON.parse(prerequisitesContent)
  
  console.log(`[LOAD] Found ${Object.keys(prerequisitesData).length} courses with prerequisites`)
  
  // Merge the data
  console.log('[MERGE] Merging course titles into prerequisites data...')
  let titlesAdded = 0
  let titlesNotFound = 0
  
  for (const [courseId, prereqEntry] of Object.entries(prerequisitesData)) {
    const courseData = courseTitlesData.courses[courseId]
    
    if (courseData) {
      // Add the title data to the prerequisite entry
      prereqEntry.title = courseData.title
      prereqEntry.credits = courseData.credits
      prereqEntry.description = courseData.description
      titlesAdded++
    } else {
      // Course not found in titles data - leave as is for now
      prereqEntry.title = courseId // Use course ID as fallback
      prereqEntry.credits = undefined
      prereqEntry.description = undefined
      titlesNotFound++
    }
  }
  
  console.log(`[STATS] Titles added: ${titlesAdded}`)
  console.log(`[STATS] Titles not found: ${titlesNotFound}`)
  
  // Save the enhanced prerequisites data
  console.log('[SAVE] Saving enhanced course_prerequisites_simple.json...')
  const enhancedContent = JSON.stringify(prerequisitesData, null, 2)
  await fs.writeFile(prerequisitesPath, enhancedContent)
  
  console.log('[SUCCESS] Course data merge completed!')
  console.log('[INFO] course_prerequisites_simple.json now includes title, credits, and description fields')
  
  // Show some examples
  console.log('\n[SAMPLE] Enhanced course entries:')
  const sampleEntries = Object.entries(prerequisitesData).slice(0, 3)
  sampleEntries.forEach(([courseId, entry]) => {
    console.log(`  ${courseId}:`)
    console.log(`    Title: ${entry.title}`)
    console.log(`    Credits: ${entry.credits || 'N/A'}`)
    console.log(`    Prerequisites: ${entry.required || 'None'}`)
    console.log()
  })
}

main()
  .catch((e) => {
    console.error('[ERROR] Failed to merge course data:', e)
    process.exit(1)
  })
