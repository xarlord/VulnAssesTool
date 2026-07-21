const BASE_URL = '/api'

let authToken: string | null = null

export function setAuthToken(token: string): void {
  authToken = token
  try {
    localStorage.setItem('vat-server-token', token)
  } catch {
    // ignore
  }
}

export function getStoredToken(): string | null {
  if (authToken) return authToken
  try {
    authToken = localStorage.getItem('vat-server-token')
  } catch {
    // ignore
  }
  return authToken
}

export function clearAuthToken(): void {
  authToken = null
  try {
    localStorage.removeItem('vat-server-token')
  } catch {
    // ignore
  }
}

const REQUEST_TIMEOUT_MS = 30000

/** Per-request options. `timeoutMs` overrides the default abort deadline for
 * long-running server operations (container scan, Syft generation) that
 * legitimately run for minutes and must not be aborted at the 30s default. */
export interface RequestOptions {
  timeoutMs?: number
}

async function request<T>(method: string, urlPath: string, body?: unknown, options?: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const token = getStoredToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Bound every request so a slow or stuck server query (e.g. the leading-wildcard
  // CPE scan over millions of rows) can't leave a caller — such as the SBOM upload
  // dialog's CPE estimation — awaiting a promise that never settles. Long jobs
  // (container scan / Syft) pass a larger timeoutMs so they aren't cut off.
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${urlPath}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request to ${urlPath} timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let error: string
    try {
      const parsed = JSON.parse(text)
      error = parsed.error || `HTTP ${response.status}`
    } catch {
      error = `HTTP ${response.status}: ${text || response.statusText}`
    }

    if (response.status === 401 || response.status === 403) {
      clearAuthToken()
    }

    throw new Error(error)
  }

  return response.json() as Promise<T>
}

export async function apiGet<T>(urlPath: string): Promise<T> {
  return request<T>('GET', urlPath)
}

export async function apiPost<T>(urlPath: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return request<T>('POST', urlPath, body, options)
}

/**
 * POST multipart/form-data (e.g. file uploads). The browser sets the
 * Content-Type (with boundary) automatically, so it must not be set here.
 */
export async function apiPostForm<T>(urlPath: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getStoredToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${BASE_URL}${urlPath}`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let error: string
    try {
      const parsed = JSON.parse(text)
      error = parsed.error || `HTTP ${response.status}`
    } catch {
      error = `HTTP ${response.status}: ${text || response.statusText}`
    }
    if (response.status === 401 || response.status === 403) {
      clearAuthToken()
    }
    throw new Error(error)
  }

  return response.json() as Promise<T>
}

export async function apiPut<T>(urlPath: string, body?: unknown): Promise<T> {
  return request<T>('PUT', urlPath, body)
}

export async function apiDelete<T>(urlPath: string): Promise<T> {
  return request<T>('DELETE', urlPath)
}
