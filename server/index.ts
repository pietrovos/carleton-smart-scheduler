/**
 * @file server/index.ts
 * @description Express server for Smart Scheduler API
 * 
 * Architecture Pattern: MVC (Model-View-Controller)
 * - Models: Prisma ORM handles data models and database interactions
 * - Views: JSON responses (API server, no HTML views)
 * - Controllers: Route handlers that orchestrate business logic
 * 
 * Design Principles Applied:
 * 1. Separation of Concerns: Each module has a single responsibility
 * 2. Dependency Injection: Services are passed to controllers for testability
 * 3. Single Responsibility Principle: Each endpoint handles one specific operation
 * 4. Open/Closed Principle: Extensible without modifying existing code
 * 
 */

import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'
import courseRoutes from './routes/courses'
import studentRoutes from './routes/students'
import scheduleRoutes from './routes/schedules'
import auditRoutes from './routes/audit'
import authRoutes from './routes/auth'
import adminRoutes from './routes/admin'

const app = express()
const PORT = process.env.PORT || 3001

// Initialize Prisma Client (Singleton Pattern)
// Rationale: Single database connection pool shared across all requests
// This improves performance and resource management
const prismaClientSingleton = () => {
  return new PrismaClient({
    log: ['error', 'warn'],
  })
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

export const prisma = globalThis.prisma ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma

// Middleware Configuration
// CORS: Allow frontend (React) to make requests from different origin
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3002',
  credentials: true
}))

// Body Parser: Parse JSON request bodies
// Design Decision: Limit payload size to prevent DoS attacks
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Request Logging Middleware (for debugging and monitoring)
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// Health Check Endpoint
// Purpose: Allow monitoring systems to verify server is running
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API Routes
// Design Pattern: Router pattern for modular route organization
app.use('/api/courses', courseRoutes)
app.use('/api/students', studentRoutes)
app.use('/api/schedules', scheduleRoutes)
app.use('/api/audit', auditRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString()
  })
})

// Global Error Handler
// Design Pattern: Centralized error handling
// Rationale: Consistent error response format across all endpoints
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err)
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    timestamp: new Date().toISOString()
  })
})

// Graceful Shutdown Handler
// Design Pattern: Graceful degradation
// Rationale: Ensure database connections are properly closed on shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...')
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...')
  await prisma.$disconnect()
  process.exit(0)
})

// Start Server
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Smart Scheduler API running on port ${PORT}`)
    console.log(`📚 Environment: ${process.env.NODE_ENV || 'development'}`)
  })
}

export default app
