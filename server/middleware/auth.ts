import { NextFunction, Request, Response } from 'express'
import jwt, { JwtPayload } from 'jsonwebtoken'

function getRequiredJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is required')
  return secret
}

const JWT_SECRET = getRequiredJwtSecret()

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string
    email: string
    role: string
  }
}

interface TokenPayload extends JwtPayload {
  userId: string
  email: string
  role: string
}

export function signToken(payload: Pick<TokenPayload, 'userId' | 'email' | 'role'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as unknown as TokenPayload
    if (!decoded.userId || !decoded.email || !decoded.role) {
      return res.status(401).json({ error: 'Invalid token' })
    }
    req.auth = { userId: decoded.userId, email: decoded.email, role: decoded.role }
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireRole(role: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.auth?.role !== role) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}
