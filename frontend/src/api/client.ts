const API_BASE = import.meta.env.VITE_API_URL || '/api'

/** User's IANA timezone for date filtering (e.g. "America/New_York"). */
function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem('access_token')
  }

  private buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const token = this.getToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extra,
    }
    const tz = getUserTimezone()
    if (tz) headers['X-User-Timezone'] = tz
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = this.buildHeaders((options.headers as Record<string, string>) || {})

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    })

    if (response.status === 401) {
      const refreshed = await this.tryRefreshToken()
      if (refreshed) {
        const retryHeaders = this.buildHeaders((options.headers as Record<string, string>) || {})
        const retryResponse = await fetch(`${API_BASE}${path}`, { ...options, headers: retryHeaders })
        if (!retryResponse.ok) throw new Error(`API error: ${retryResponse.status}`)
        return retryResponse.json()
      }
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      window.location.href = '/login'
      throw new Error('Session expired')
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(error.detail || `API error: ${response.status}`)
    }

    return response.json()
  }

  private async tryRefreshToken(): Promise<boolean> {
    const refreshToken = localStorage.getItem('refresh_token')
    if (!refreshToken) return false

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!response.ok) return false
      const data = await response.json()
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      return true
    } catch {
      return false
    }
  }

  get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    let url = path
    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.append(key, String(value))
        }
      })
      const qs = searchParams.toString()
      if (qs) url += `?${qs}`
    }
    return this.request<T>(url)
  }

  async download(
    path: string,
    params?: Record<string, string | number | undefined>,
    fallbackFilename = 'download'
  ): Promise<void> {
    let url = `${API_BASE}${path}`
    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.append(key, String(value))
        }
      })
      const qs = searchParams.toString()
      if (qs) url += `?${qs}`
    }

    let headers = this.buildHeaders()
    delete headers['Content-Type']

    let response = await fetch(url, { headers })

    if (response.status === 401) {
      const refreshed = await this.tryRefreshToken()
      if (refreshed) {
        headers = this.buildHeaders()
        delete headers['Content-Type']
        response = await fetch(url, { headers })
      }
      if (!response.ok) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
        throw new Error('Session expired')
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(error.detail || `API error: ${response.status}`)
    }

    const blob = await response.blob()
    const disposition = response.headers.get('Content-Disposition')
    let filename = fallbackFilename
    if (disposition) {
      const match = disposition.match(/filename="?([^";\n]+)"?/)
      if (match) filename = match[1].trim()
    }

    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async downloadPost(
    path: string,
    body: unknown,
    fallbackFilename = 'download'
  ): Promise<void> {
    const headers = this.buildHeaders()

    let response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (response.status === 401) {
      const refreshed = await this.tryRefreshToken()
      if (refreshed) {
        const retryHeaders = this.buildHeaders()
        response = await fetch(`${API_BASE}${path}`, {
          method: 'POST',
          headers: retryHeaders,
          body: JSON.stringify(body),
        })
      }
      if (!response.ok) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
        throw new Error('Session expired')
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(error.detail || `API error: ${response.status}`)
    }

    const blob = await response.blob()
    const disposition = response.headers.get('Content-Disposition')
    let filename = fallbackFilename
    if (disposition) {
      const match = disposition.match(/filename="?([^";\n]+)"?/)
      if (match) filename = match[1].trim()
    }

    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' })
  }

  async postFormData<T>(path: string, formData: FormData): Promise<T> {
    const token = this.getToken()
    const headers: Record<string, string> = {}
    const tz = getUserTimezone()
    if (tz) headers['X-User-Timezone'] = tz
    if (token) headers['Authorization'] = `Bearer ${token}`

    let response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (response.status === 401) {
      const refreshed = await this.tryRefreshToken()
      if (refreshed) {
        const retryToken = this.getToken()
        const retryHeaders: Record<string, string> = {}
        if (tz) retryHeaders['X-User-Timezone'] = tz
        if (retryToken) retryHeaders['Authorization'] = `Bearer ${retryToken}`
        response = await fetch(`${API_BASE}${path}`, {
          method: 'POST',
          headers: retryHeaders,
          body: formData,
        })
      }
      if (!response.ok) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
        throw new Error('Session expired')
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(error.detail || `API error: ${response.status}`)
    }

    return response.json()
  }
}

export const api = new ApiClient()
