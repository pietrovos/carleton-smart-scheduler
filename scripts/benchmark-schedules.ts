import { PrismaClient } from '@prisma/client'
import { estimateCourseBranching, generateSchedulesForCourses, loadCourseSectionsForScheduling } from '../server/lib/schedule-generation'

const prisma = new PrismaClient()

interface CandidateCourse {
  courseId: string
  branching: number
  sectionCount: number
}

interface Scenario {
  name: string
  courseIds: string[]
}

async function buildCandidateCourses(term: string): Promise<CandidateCourse[]> {
  const courses = await prisma.course.findMany({
    where: {
      sections: {
        some: { term }
      }
    },
    select: {
      id: true,
      sections: {
        where: { term },
        select: { id: true }
      }
    },
    orderBy: { id: 'asc' }
  })

  const candidates: CandidateCourse[] = []

  for (const course of courses) {
    const loaded = await loadCourseSectionsForScheduling(prisma, [course.id], term)
    const sections = loaded[0]?.sections || []
    const branching = estimateCourseBranching(sections)

    if (branching > 0) {
      candidates.push({
        courseId: course.id,
        branching,
        sectionCount: course.sections.length
      })
    }
  }

  return candidates.sort((a, b) => a.branching - b.branching || a.courseId.localeCompare(b.courseId))
}

function uniqueScenarioCourses(source: CandidateCourse[], count: number): string[] {
  return source.slice(0, count).map(course => course.courseId)
}

function buildScenarios(candidates: CandidateCourse[]): Scenario[] {
  const low = uniqueScenarioCourses(candidates, 4)
  const mediumStart = Math.max(0, Math.floor((candidates.length - 5) / 2))
  const medium = uniqueScenarioCourses(candidates.slice(mediumStart), 5)
  const high = uniqueScenarioCourses([...candidates].sort((a, b) => b.branching - a.branching), 6)

  return [
    { name: 'Low', courseIds: low },
    { name: 'Medium', courseIds: medium },
    { name: 'High', courseIds: high }
  ].filter((scenario) => scenario.courseIds.length > 0)
}

async function timeScenario(term: string, scenario: Scenario, runs: number, includePrerequisites: boolean) {
  const timingsMs: number[] = []
  let scheduleCount = 0

  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    const schedules = await generateSchedulesForCourses(prisma, {
      courseIds: scenario.courseIds,
      term,
      maxSchedules: 100,
      completedCourses: [],
      includePrerequisites,
    })
    const end = performance.now()
    timingsMs.push(end - start)
    scheduleCount = schedules.length
  }

  timingsMs.sort((a, b) => a - b)

  const average = timingsMs.reduce((sum, value) => sum + value, 0) / timingsMs.length
  const p95 = timingsMs[Math.min(timingsMs.length - 1, Math.floor(timingsMs.length * 0.95))]

  return {
    scheduleCount,
    averageMs: average,
    minMs: timingsMs[0],
    maxMs: timingsMs[timingsMs.length - 1],
    p95Ms: p95,
  }
}

async function main() {
  const term = process.argv[2] || '202530'
  const runs = Number(process.argv[3] || '5')

  const candidates = await buildCandidateCourses(term)
  const scenarios = buildScenarios(candidates)

  if (scenarios.length === 0) {
    throw new Error(`No benchmark scenarios available for term ${term}`)
  }

  console.log(`Benchmark term: ${term}`)
  console.log(`Candidate courses considered: ${candidates.length}`)
  console.log(`Runs per scenario: ${runs}`)

  for (const scenario of scenarios) {
    const complexity = scenario.courseIds
      .map((courseId) => candidates.find(candidate => candidate.courseId === courseId))
      .filter((course): course is CandidateCourse => Boolean(course))

    const timed = await timeScenario(term, scenario, runs, true)

    console.log('')
    console.log(`${scenario.name} complexity`)
    console.log(`Courses: ${scenario.courseIds.join(', ')}`)
    console.log(`Branching factors: ${complexity.map(course => `${course.courseId}:${course.branching}`).join(', ')}`)
    console.log(`Schedules returned: ${timed.scheduleCount}`)
    console.log(`Average: ${timed.averageMs.toFixed(2)} ms`)
    console.log(`Min: ${timed.minMs.toFixed(2)} ms`)
    console.log(`Max: ${timed.maxMs.toFixed(2)} ms`)
    console.log(`P95: ${timed.p95Ms.toFixed(2)} ms`)
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
