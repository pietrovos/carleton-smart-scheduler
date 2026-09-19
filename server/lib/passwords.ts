import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scrypt = promisify(scryptCallback)
const KEY_LENGTH = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const key = await scrypt(password, salt, KEY_LENGTH) as Buffer
  return `scrypt:${salt}:${key.toString('hex')}`
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, encodedKey] = storedHash.split(':')
  if (algorithm !== 'scrypt' || !salt || !encodedKey) return false

  const storedKey = Buffer.from(encodedKey, 'hex')
  if (storedKey.length !== KEY_LENGTH) return false

  const suppliedKey = await scrypt(password, salt, KEY_LENGTH) as Buffer
  return timingSafeEqual(storedKey, suppliedKey)
}
