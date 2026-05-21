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

async function request<T>(method: string, urlPath: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const token = getStoredToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
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

export async function apiGet<T>(urlPath: string): Promise<T> {
  return request<T>('GET', urlPath)
}

export async function apiPost<T>(urlPath: string, body?: unknown): Promise<T> {
  return request<T>('POST', urlPath, body)
}

export async function apiPut<T>(urlPath: string, body?: unknown): Promise<T> {
  return request<T>('PUT', urlPath, body)
}
