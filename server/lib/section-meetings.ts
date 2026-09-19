import { Prisma, PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

export interface SectionMeetingRecord {
  sectionId: string
  days: string | null
  startTime: string | null
  endTime: string | null
  startDate: string | null
  endDate: string | null
  roomCapacity: number | null
}

export async function ensureSectionMeetingsTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "section_meetings" (
      "id" TEXT PRIMARY KEY,
      "sectionId" TEXT NOT NULL REFERENCES "sections"("id") ON DELETE CASCADE,
      "days" TEXT,
      "startTime" TEXT,
      "endTime" TEXT,
      "startDate" TEXT,
      "endDate" TEXT,
      "roomCapacity" INTEGER,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "section_meetings_sectionId_idx"
    ON "section_meetings"("sectionId");
  `)
}

export async function fetchSectionMeetings(
  prisma: PrismaClient,
  sectionIds: string[]
): Promise<Map<string, SectionMeetingRecord[]>> {
  if (sectionIds.length === 0) {
    return new Map()
  }

  const rows = await prisma.$queryRaw<SectionMeetingRecord[]>(
    Prisma.sql`
      SELECT
        "sectionId",
        "days",
        "startTime",
        "endTime",
        "startDate",
        "endDate",
        "roomCapacity"
      FROM "section_meetings"
      WHERE "sectionId" IN (${Prisma.join(sectionIds)})
      ORDER BY "sectionId", "days" ASC, "startTime" ASC, "endTime" ASC
    `
  )

  const meetingsBySection = new Map<string, SectionMeetingRecord[]>()

  for (const row of rows) {
    if (!meetingsBySection.has(row.sectionId)) {
      meetingsBySection.set(row.sectionId, [])
    }

    meetingsBySection.get(row.sectionId)!.push(row)
  }

  return meetingsBySection
}

export async function insertSectionMeetings(
  prisma: PrismaClient,
  sectionId: string,
  meetings: Omit<SectionMeetingRecord, 'sectionId'>[]
): Promise<void> {
  for (const meeting of meetings) {
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "section_meetings" (
          "id",
          "sectionId",
          "days",
          "startTime",
          "endTime",
          "startDate",
          "endDate",
          "roomCapacity",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${randomUUID()},
          ${sectionId},
          ${meeting.days},
          ${meeting.startTime},
          ${meeting.endTime},
          ${meeting.startDate},
          ${meeting.endDate},
          ${meeting.roomCapacity},
          NOW(),
          NOW()
        )
      `
    )
  }
}
