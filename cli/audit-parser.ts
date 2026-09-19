import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'

const prisma = new PrismaClient()

export interface ElectiveCategoryDefinition {
  id: string
  label: string
  selectionUnitCredits: number
  courses: string[]
}

export interface RequirementInfo {
  title: string
  status: 'OK' | 'NO' | 'IP' | 'NONE'
  creditsRequired: number
  creditsCompleted: number
  creditsInProgress: number
  courseOptions: string[] // List of courses that satisfy this requirement
}

export interface StudentAuditData {
  studentId: string
  name: string
  program: string
  completedCourses: Array<{
    courseId: string
    grade: string
  }>
  currentCourses: Array<{
    courseId: string
    term: string
  }>
  requirements: RequirementInfo[]
}

/**
 * Calculate which courses the student still needs to take
 * Returns only core (non-elective) courses from unfulfilled requirements.
 * Elective categories are NOT expanded here — they are handled separately
 * via getElectiveRequirements().
 */
export function getRemainingCourses(
  auditData: StudentAuditData,
  electiveCategoryLookup: Record<string, ElectiveCategoryDefinition> = {}
): string[] {
  const completedSet = new Set(auditData.completedCourses.map(c => c.courseId))
  const currentSet = new Set(auditData.currentCourses.map(c => c.courseId))
  const remainingCourses = new Set<string>()
  
  // Look at unfulfilled requirements (status = 'NO' or 'IP' with remaining credits)
  for (const req of auditData.requirements) {
    const creditsNeeded = getCreditsNeeded(req)
    
    if (creditsNeeded > 0) {
      for (const option of req.courseOptions) {
        // Skip elective category tokens — those are handled by getElectiveRequirements()
        if (electiveCategoryLookup[option]) continue

        // Add core course if it's not completed and not currently enrolled
        if (!completedSet.has(option) && !currentSet.has(option)) {
          remainingCourses.add(option)
        }
      }
    }
  }
  
  return Array.from(remainingCourses).sort()
}

/**
 * Get unfulfilled requirements with expanded course options
 * Useful for schedule suggestion where we need to know what requirements need courses
 */
export function getUnfulfilledRequirements(
  auditData: StudentAuditData,
  electiveCategoryLookup: Record<string, ElectiveCategoryDefinition> = {}
): Array<RequirementInfo & { expandedOptions: string[] }> {
  const completedSet = new Set(auditData.completedCourses.map(c => c.courseId))
  const currentSet = new Set(auditData.currentCourses.map(c => c.courseId))
  
  return auditData.requirements
    .filter(req => {
      const creditsNeeded = getCreditsNeeded(req)
      return creditsNeeded > 0
    })
    .map(req => {
      const expandedOptions = expandElectiveCategories(req.courseOptions, electiveCategoryLookup)
        .filter(c => !completedSet.has(c) && !currentSet.has(c))
      return { ...req, expandedOptions }
    })
}

export interface ElectiveRequirement {
  category: string            // e.g. 'CS_ELECTIVE', 'SCIENCE_ELECTIVE'
  label: string               // Human-readable label, e.g. 'Computer Science Elective'
  creditsNeeded: number       // Credits still needed for this category
  selectionUnitCredits: number
  courseOptions: string[]     // Expanded list of courses that satisfy this requirement
}

const COURSE_CODE_PATTERN = /[A-Z]{3,4}\s*(?:\d{4}|\d{1}XXX)/g

function expandElectiveCategories(
  courseOptions: string[],
  electiveCategoryLookup: Record<string, ElectiveCategoryDefinition>
): string[] {
  const expanded = new Set<string>()

  for (const option of courseOptions) {
    const category = electiveCategoryLookup[option]
    if (category) {
      for (const courseId of category.courses) {
        expanded.add(courseId)
      }
      continue
    }

    expanded.add(option)
  }

  return Array.from(expanded)
}

function getCreditsNeeded(requirement: RequirementInfo): number {
  return requirement.creditsRequired - requirement.creditsCompleted - requirement.creditsInProgress
}

function parseRequirementStatus(statusClass: string): RequirementInfo['status'] {
  if (statusClass.includes('OK')) return 'OK'
  if (statusClass.includes('IP')) return 'IP'
  if (statusClass.includes('NONE')) return 'NONE'
  return 'NO'
}

function isGenericRequirementTitle(title: string): boolean {
  const lowerTitle = title.toLowerCase()
  return (
    lowerTitle.includes('year standing') ||
    lowerTitle.includes('residency') ||
    lowerTitle.includes('cgpa required')
  )
}

function extractCourseCodes(title: string): string[] {
  return (title.match(COURSE_CODE_PATTERN) || [])
    .map(code => code.replace(/\s+/g, ''))
}

function detectElectiveCategory(title: string): string | null {
  const lowerTitle = title.toLowerCase()
  if (lowerTitle.includes('complementary studies')) return 'COMPLEMENTARY_STUDIES'
  if (lowerTitle.includes('computer science elective')) return 'CS_ELECTIVE'
  if (lowerTitle.includes('basic science')) return 'SCIENCE_ELECTIVE'
  return null
}

function buildCourseOptions(title: string): string[] {
  const courseCodes = extractCourseCodes(title)
  const electiveCategory = detectElectiveCategory(title)

  if (courseCodes.length === 0 && !electiveCategory) {
    return []
  }

  return courseCodes.length > 0 ? courseCodes : electiveCategory ? [electiveCategory] : []
}

/**
 * Extract structured elective requirements from audit data.
 * Returns only unfulfilled elective-category requirements with their available course options
 * (excluding courses already completed or in progress).
 */
export function getElectiveRequirements(
  auditData: StudentAuditData,
  electiveCategoryLookup: Record<string, ElectiveCategoryDefinition> = {}
): ElectiveRequirement[] {
  const completedSet = new Set(auditData.completedCourses.map(c => c.courseId))
  const currentSet = new Set(auditData.currentCourses.map(c => c.courseId))
  const grouped = new Map<string, ElectiveRequirement>()

  for (const req of auditData.requirements) {
    const creditsNeeded = getCreditsNeeded(req)
    if (creditsNeeded <= 0) continue

    // Check if any of the courseOptions is an elective category token
    for (const option of req.courseOptions) {
      const categoryDefinition = electiveCategoryLookup[option]
      if (categoryDefinition) {
        const expanded = categoryDefinition.courses
          .filter(c => !completedSet.has(c) && !currentSet.has(c))
        const existing = grouped.get(option)

        if (existing) {
          existing.creditsNeeded += creditsNeeded
          existing.courseOptions = Array.from(new Set([...existing.courseOptions, ...expanded])).sort()
        } else {
          grouped.set(option, {
            category: option,
            label: categoryDefinition.label,
            creditsNeeded,
            selectionUnitCredits: categoryDefinition.selectionUnitCredits,
            courseOptions: expanded.sort(),
          })
        }
      }
    }
  }

  return Array.from(grouped.values())
}

// Extract requirements from HTML audit
function extractRequirementsFromHTML(htmlContent: string): RequirementInfo[] {
  const requirements: RequirementInfo[] = []
  
  // Split by subrequirement div start
  const parts = htmlContent.split('<div class="subrequirement"')
  // First part is before any subrequirement
  for (let i = 1; i < parts.length; i++) {
    const subreqFull = '<div class="subrequirement"' + parts[i]
    
    // Extract attributes from the opening tag
    const openTagMatch = subreqFull.match(/<div[^>]*rqd[hH]ours="([\d.]+)"[^>]*>/)
    if (!openTagMatch) continue
    
    const rqdHours = parseFloat(openTagMatch[1]) || 0
    
    // Find the end of this subrequirement block
    // We want the content from the end of the opening tag to either the next subreq start or the divider
    let subreqContent = parts[i];
    const splitIndex = subreqContent.search(/<div class="subrequirement"|<\/div>\s*<hr/);
    if (splitIndex !== -1) {
      subreqContent = subreqContent.substring(0, splitIndex);
    }
    
    // Skip zero-credit and very high credit requirements (300 is used for "excess" tracking)
    if (rqdHours === 0 || rqdHours >= 100) {
      continue
    }
    
    // Extract status
    const statusMatch = subreqContent.match(/class="status\s+(Status_\w+)"/)
    const statusClass = statusMatch ? statusMatch[1] : 'Status_NO'
    
    // Extract title
    const titleMatch = subreqContent.match(/<span[^>]*class="subreqTitle[^"]*"[^>]*>([\s\S]*?)<\/span>/)
    if (!titleMatch) continue
    
    const titleHtml = titleMatch[1]
    const title = titleHtml
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    // Skip generic progress requirements
    if (isGenericRequirementTitle(title)) {
      continue
    }
    
    // Extract actual credits completed from subrequirementTotals
    let creditsCompleted = 0
    let creditsInProgress = 0
    
    const completedMatch = subreqContent.match(/<span class="hours number">\s*([\d.]+)<\/span><span class="hourslabel fieldlabel">cr\. Complete/)
    if (completedMatch) {
      creditsCompleted = parseFloat(completedMatch[1]) || 0
    }
    
    const ipMatch = subreqContent.match(/class="subreqIpHours"[\s\S]*?<td class="hours number">\s*([\d.]+)/)
    if (ipMatch) {
      creditsInProgress = parseFloat(ipMatch[1]) || 0
    }
    
    // Determine status from class
    const status = parseRequirementStatus(statusClass)
    const courseOptions = buildCourseOptions(title)

    if (courseOptions.length > 0) {
      requirements.push({
        title: title.substring(0, 100),
        status,
        creditsRequired: rqdHours,
        creditsCompleted,
        creditsInProgress,
        courseOptions,
      })
    }
  }
  
  return requirements
}

function cleanProgramName(program: string): string {
  return program
    .replace(/\bEmail\b.*$/i, '')
    .replace(/\b\d{9}\b.*$/, '')
    .replace(/[a-zA-Z0-9.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9.-]+.*$/, '')
    .trim()
}

export function parseAuditHTML(htmlContent: string): StudentAuditData {
  // Extract student ID - look in header info area
  const studentIdMatch = htmlContent.match(/(\d{9})/)
  const studentId = studentIdMatch ? studentIdMatch[1] : ''

  // Extract student name from header
  const nameMatch = htmlContent.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/)
  const name = nameMatch ? `${nameMatch[2]} ${nameMatch[1]}` : ''

  // Extract program
  const programMatch = htmlContent.match(/Bachelor of Engineering - ([^<]+)/)
  const program = programMatch ? cleanProgramName(programMatch[1]) : ''

  // Extract courses (both completed and current)
  const courseMatches = Array.from(htmlContent.matchAll(
    /<tr[^>]*class="takenCourse[^"]*"[^>]*>[\s\S]*?<td[^>]*class="term"[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*class="course"[^>]*>([A-Z]{3,4}\s+\d{4})<\/td>[\s\S]*?<td[^>]*class="grade"[^>]*>([^<]+)<\/td>/g
  ))

  const completedCourses: Array<{ courseId: string; grade: string }> = []
  const currentCourses: Array<{ courseId: string; term: string }> = []
  
  for (const match of courseMatches) {
    const term = match[1].trim()
    const courseId = match[2].replace(/\s+/g, '') // Remove spaces from "SYSC 4907" -> "SYSC4907"
    const grade = match[3].trim()
    
    if (grade === 'CUR') {
      // Current course
      currentCourses.push({ courseId, term })
    } else if (grade && grade !== '') {
      // Completed course
      completedCourses.push({ courseId, grade })
    }
  }

  // Extract requirements from HTML
  const requirements = extractRequirementsFromHTML(htmlContent)

  return {
    studentId,
    name,
    program,
    completedCourses,
    currentCourses,
    requirements
  }
}

// Extract program requirements from the PDF (which courses are needed for the degree)
function extractRequirementsFromPDF(pdfText: string): RequirementInfo[] {
  const requirements: RequirementInfo[] = []
  
  // Match lines like "4) 4.0 credits in NET 4001, NET 4005, NET 4007..."
  // This pattern matches the number, the credit amount, and the text following it
  const reqPattern = /(?:^|[\r\n]) *(\d+)\) +([\d.]+) +credits? (?:in|from) ([\s\S]*?)(?=[\r\n] *\d+\) |[\r\n] *NEEDS:|[\r\n] *Term| {5,}\d+\.\d+ +cr\.|[\r\n] *\*+|$)/gm
  
  const matches = Array.from(pdfText.matchAll(reqPattern));
  // console.log(`DEBUG: Found ${matches.length} potential requirements in PDF`);
  
  for (const match of matches) {
    const creditsRequired = parseFloat(match[2]) || 0
    let title = match[3]
      .replace(/\s+/g, ' ')
      .trim();

    // Skip generic requirements
    if (isGenericRequirementTitle(title)) {
      continue
    }

    const courseOptions = buildCourseOptions(title)
    if (courseOptions.length === 0) continue
    
    // Check if requirement is satisfied by looking at the next few lines
    const textAfterReq = pdfText.substring(pdfText.indexOf(match[0]))
    const nextLines = textAfterReq.substring(0, 500)
    
    let status: 'OK' | 'NO' | 'IP' | 'NONE' = 'NO'
    let creditsCompleted = 0
    let creditsInProgress = 0
    
    // Check how many credits completed
    const completeMatch = nextLines.match(/([\d.]+)\s+cr\.\s+Complete/)
    if (completeMatch) {
      creditsCompleted = parseFloat(completeMatch[1]) || 0
    }
    
    // Check for in-progress courses (format: "IP    3.00 Credits")
    const ipMatch = nextLines.match(/IP\s+([\d.]+)\s+Credits/)
    if (ipMatch) {
      creditsInProgress = parseFloat(ipMatch[1]) || 0
    }
    
    if (nextLines.match(/\n *NEEDS:/)) {
      status = creditsInProgress > 0 ? 'IP' : 'NO'
    } else if (creditsCompleted >= creditsRequired) {
      status = 'OK'
    } else if (creditsCompleted + creditsInProgress >= creditsRequired) {
      status = 'IP'
    }
    
    requirements.push({
      title: title.substring(0, 100),
      status,
      creditsRequired,
      creditsCompleted,
      creditsInProgress,
      courseOptions,
    })
  }
  
  return requirements
}

// Parse the text extracted from a PDF audit
// Lines look like: "21FA   CHEM 1101           0.50   A+"
export function parseAuditPDF(pdfText: string): StudentAuditData {
  const studentIdMatch = pdfText.match(/(\d{9})/)
  const studentId = studentIdMatch ? studentIdMatch[1] : ''

  const nameMatch = pdfText.match(/([A-Z][a-z]+),\s+([A-Z][a-z]+)/)
  const name = nameMatch ? `${nameMatch[2]} ${nameMatch[1]}` : ''

  const programMatch = pdfText.match(/Bachelor of Engineering\s*-\s*([A-Za-z\s\-&]+)/i)
  const program = programMatch ? cleanProgramName(programMatch[1]) : ''

  // Extract all courses from the audit
  const completedCourses: Array<{ courseId: string; grade: string }> = []
  const currentCourses: Array<{ courseId: string; term: string }> = []
  const seenCompleted = new Set<string>()
  const seenCurrent = new Set<string>()
  
  // Regex to match course lines: "21FA   CHEM 1101           0.50   A+"
  const courseLinePattern = /^\s*(\d{2}(?:FA|WN|SU))\s+([A-Z]{3,4})\s+(\d{4})\s+([\d.]+)\s+([A-Z+\-]+)(?:\s+(?:RP|CUR|SAT|TR|UNS|IP|DEF))?/gm
  
  const matches = Array.from(pdfText.matchAll(courseLinePattern))
  
  for (const match of matches) {
    const term = match[1]
    const courseCode = match[2]
    const courseNum = match[3]
    const courseId = courseCode + courseNum
    let grade = match[5]
    
    const fullMatch = match[0]
    const isCurrent = fullMatch.includes('CUR') || fullMatch.includes('DEF') || grade === 'CUR' || grade === 'DEF'
    
    if (isCurrent && !seenCurrent.has(courseId)) {
      currentCourses.push({ courseId, term })
      seenCurrent.add(courseId)
    } else if (grade && grade !== 'CUR' && grade !== 'DEF' && grade !== 'UNS' && 
               grade !== 'F' && grade !== 'X' && grade !== 'NR') {
      // PDF is chronological (oldest first), so later matches are more recent grades
      // If course already seen, overwrite with the more recent grade
      const existingIndex = completedCourses.findIndex(c => c.courseId === courseId)
      if (existingIndex >= 0) {
        completedCourses[existingIndex].grade = grade  // Overwrite with newer grade
      } else {
        completedCourses.push({ courseId, grade })
        seenCompleted.add(courseId)
      }
    }
  }

  const requirements = extractRequirementsFromPDF(pdfText)

  return {
    studentId,
    name,
    program,
    completedCourses,
    currentCourses,
    requirements
  }
}

export async function saveStudentAuditData(auditData: StudentAuditData): Promise<void> {
  // Create or update student
  const student = await prisma.student.upsert({
    where: { studentId: auditData.studentId },
    update: {
      name: auditData.name,
      program: auditData.program
    },
    create: {
      studentId: auditData.studentId,
      name: auditData.name,
      program: auditData.program
    }
  })

  // Delete existing course completions for this student
  await prisma.courseCompletion.deleteMany({
    where: { studentId: student.id }
  })

  // Add course completions
  for (const completion of auditData.completedCourses) {
    // Check if course exists in database
    const course = await prisma.course.findUnique({
      where: { id: completion.courseId }
    })

    if (course) {
      await prisma.courseCompletion.upsert({
        where: {
          studentId_courseId: {
            studentId: student.id,
            courseId: completion.courseId
          }
        },
        update: {
          grade: completion.grade
        },
        create: {
          studentId: student.id,
          courseId: completion.courseId,
          grade: completion.grade
        }
      })
    } else {
      console.log(`Warning: Course ${completion.courseId} not found in database, skipping...`)
    }
  }
}

export async function ingestAuditFromFile(filePath: string): Promise<void> {
  try {
    const htmlContent = fs.readFileSync(filePath, 'utf-8')
    const auditData = parseAuditHTML(htmlContent)
    
    console.log(`Parsed audit for: ${auditData.name} (${auditData.studentId})`)
    console.log(`Program: ${auditData.program}`)
    console.log(`Found ${auditData.completedCourses.length} completed courses`)
    
    await saveStudentAuditData(auditData)
    console.log('✓ Student audit data saved successfully!')
    
  } catch (error) {
    console.error('Error ingesting audit:', error)
    throw error
  }
}
