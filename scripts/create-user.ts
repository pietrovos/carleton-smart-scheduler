import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../server/lib/passwords'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.USER_EMAIL?.trim().toLowerCase()
  const password = process.env.USER_PASSWORD
  const role = process.env.USER_ROLE === 'ADMIN' ? 'ADMIN' : 'STUDENT'
  const name = process.env.USER_NAME?.trim() || null

  if (!email || !password) {
    throw new Error('USER_EMAIL and USER_PASSWORD are required')
  }
  if (password.length < 12) {
    throw new Error('USER_PASSWORD must be at least 12 characters')
  }

  const passwordHash = await hashPassword(password)

  await prisma.user.upsert({
    where: { email },
    update: { password: passwordHash, name, role },
    create: { email, password: passwordHash, name, role }
  })

  console.log(`Created or updated ${role.toLowerCase()} user ${email}`)
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
