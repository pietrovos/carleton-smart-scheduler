import type { PrismaClient } from '@prisma/client'

export interface ElectiveCategoryDefinition {
  id: string
  label: string
  selectionUnitCredits: number
  courses: string[]
}

const DEFAULT_SELECTION_UNIT_CREDITS = 0.5

export async function listElectiveCategoryDefinitions(prisma: PrismaClient): Promise<ElectiveCategoryDefinition[]> {
  const categories = await prisma.electiveCategory.findMany({
    include: {
      courses: {
        include: {
          course: {
            select: { id: true }
          }
        },
        orderBy: {
          courseId: 'asc'
        }
      }
    },
    orderBy: {
      id: 'asc'
    }
  })

  return categories.map(category => ({
    id: category.id,
    label: category.label,
    selectionUnitCredits: DEFAULT_SELECTION_UNIT_CREDITS,
    courses: category.courses.map(item => item.course.id)
  }))
}

export async function getElectiveCategoryLookup(prisma: PrismaClient): Promise<Record<string, ElectiveCategoryDefinition>> {
  const categories = await listElectiveCategoryDefinitions(prisma)

  return Object.fromEntries(
    categories.map(category => [category.id, category])
  )
}
