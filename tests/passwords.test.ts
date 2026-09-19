import assert from 'node:assert/strict'
import test from 'node:test'
import { hashPassword, verifyPassword } from '../server/lib/passwords'

test('hashes and verifies a password', async () => {
  const hash = await hashPassword('a-long-test-password')

  assert.match(hash, /^scrypt:[a-f0-9]+:[a-f0-9]+$/)
  assert.equal(await verifyPassword('a-long-test-password', hash), true)
  assert.equal(await verifyPassword('wrong-password', hash), false)
})

test('rejects plaintext and malformed password values', async () => {
  assert.equal(await verifyPassword('password', 'password'), false)
  assert.equal(await verifyPassword('password', 'scrypt:bad:value'), false)
})
