import { Router, Request, Response } from 'express'
import { prisma } from '../index'
import { AuthenticatedRequest, authenticateToken, signToken } from '../middleware/auth'
import { verifyPassword } from '../lib/passwords'

const router = Router()
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email).trim().toLowerCase() }
    })

    if (!user || !await verifyPassword(String(password), user.password)) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role })

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error during login' })
  }
})

/**
 * GET /api/auth/me
 * Validate current session token
 */
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({ id: user.id, email: user.email, name: user.name, role: user.role })
  } catch {
    res.status(500).json({ error: 'Failed to load user' })
  }
})

export default router
