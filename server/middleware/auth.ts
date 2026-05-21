/**
 * Lightweight Auth Middleware
 *
 * Generates a random 32-byte API token on first launch.
 * Binds to 127.0.0.1 only — no external access.
 * In development mode, auth is skipped entirely.
 */

import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Request, Response, NextFunction } from 'express'
import { config, isDev } from '../config.js'

const TOKEN_LENGTH = 32

function generateToken(): string {
  return randomBytes(TOKEN_LENGTH).toString('hex')
}

function getTokenFilePath(): string {
  return config.TOKEN_PATH
}

export function loadOrCreateToken(): string {
  const tokenPath = getTokenFilePath()
  const dir = path.dirname(tokenPath)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  if (existsSync(tokenPath)) {
    const token = readFileSync(tokenPath, 'utf-8').trim()
    if (token.length === TOKEN_LENGTH * 2) {
      return token
    }
  }

  const token = generateToken()
  writeFileSync(tokenPath, token, 'utf-8')
  console.log(`[Auth] Generated new server token. Stored in: ${tokenPath}`)
  return token
}

let serverToken: string | null = null

export function getServerToken(): string {
  if (!serverToken) {
    serverToken = loadOrCreateToken()
  }
  return serverToken
}

const SKIP_AUTH_PATHS = ['/api/health', '/api/handshake']

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (isDev()) {
    next()
    return
  }

  if (SKIP_AUTH_PATHS.some((p) => req.path === p || req.path.startsWith(p + '/'))) {
    next()
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' })
    return
  }

  const token = authHeader.slice(7)
  if (token !== getServerToken()) {
    res.status(403).json({ success: false, error: 'Invalid token' })
    return
  }

  next()
}
