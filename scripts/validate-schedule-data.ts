import { existsSync, promises as fs } from 'fs'
import * as path from 'path'

interface ScheduleRow {
  TERM: string
  CRN: string
  SUBJ: string
  CRSE: string
  SECT: string
  INSTR_TYPE: string
  DAYS: string
  START_TIME: string
  END_TIME: string
  ROOM_CAP: string
}

function parseTsv(content: string): ScheduleRow[] {
  const lines = content.split(/\r?\n/).filter(Boolean)
  const [headerLine, ...dataLines] = lines
  const headers = headerLine.split('\t')

  return dataLines.map((line) => {
    const values = line.split('\t')
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])) as unknown as ScheduleRow
  })
}

function isValidTime(value: string): boolean {
  return /^\d{3,4}$/.test(value)
}

function isAcceptedPlaceholderTime(row: ScheduleRow): boolean {
  return !row.DAYS && row.START_TIME === '0' && row.END_TIME === '1159'
}

function normalizeTime(value: string): number {
  return Number(value.padStart(4, '0'))
}

async function main() {
  const fileName = ['Sched.csv', 'sched.csv'].find((candidate) =>
    existsSync(path.join(process.cwd(), candidate))
  )

  if (!fileName) {
    throw new Error('Sched.csv not found in project root')
  }

  const fullPath = path.join(process.cwd(), fileName)
  const content = await fs.readFile(fullPath, 'utf-8')
  const rows = parseTsv(content)

  const supportedTerms = new Set(['Fall', 'Winter'])
  const invalidTerms = rows.filter((row) => !supportedTerms.has(row.TERM))
  const malformedTimes = rows.filter((row) => {
    if (!row.START_TIME && !row.END_TIME) return false
    if (isAcceptedPlaceholderTime(row)) return false
    return !isValidTime(row.START_TIME) || !isValidTime(row.END_TIME)
  })
  const reversedTimes = rows.filter((row) => {
    if (isAcceptedPlaceholderTime(row)) return false
    if (!isValidTime(row.START_TIME) || !isValidTime(row.END_TIME)) return false
    return normalizeTime(row.START_TIME) >= normalizeTime(row.END_TIME)
  })
  const tbaRows = rows.filter((row) => !row.DAYS && !row.START_TIME && !row.END_TIME)
  const latestEnd = rows
    .filter((row) => isValidTime(row.END_TIME))
    .reduce((latest, row) => normalizeTime(row.END_TIME) > normalizeTime(latest.END_TIME) ? row : latest, rows[0])

  if (invalidTerms.length > 0) {
    throw new Error(`Unsupported term labels found: ${invalidTerms.slice(0, 5).map((row) => row.TERM).join(', ')}`)
  }

  if (malformedTimes.length > 0) {
    throw new Error(`Malformed time rows found: ${malformedTimes.slice(0, 5).map((row) => `${row.SUBJ}${row.CRSE} ${row.SECT}`).join(', ')}`)
  }

  if (reversedTimes.length > 0) {
    throw new Error(`Rows with start time after end time found: ${reversedTimes.slice(0, 5).map((row) => `${row.SUBJ}${row.CRSE} ${row.SECT}`).join(', ')}`)
  }

  console.log('Schedule data validation passed')
  console.log(`Rows checked: ${rows.length}`)
  console.log(`TBA rows: ${tbaRows.length}`)
  console.log(`Latest end time: ${latestEnd.END_TIME} (${latestEnd.SUBJ}${latestEnd.CRSE} ${latestEnd.SECT}, ${latestEnd.TERM})`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
