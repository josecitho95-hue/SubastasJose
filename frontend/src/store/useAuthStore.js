import { create } from 'zustand'
import api from '../services/api'

/**
 * Extract a human-readable string from an API error response.
 * Pydantic/FastAPI returns `detail` as either:
 *   - a plain string (e.g. "Invalid credentials")
 *   - an array of validation errors (e.g. [{msg: "...", loc: [...]}])
 *
 * We defensively normalise both shapes so React never tries to render an array.
 */
function extractErrorMessage(err) {
  const detail = err?.response?.data?.detail
  if (Array.isArray(detail) && detail.length > 0) {
    // Pydantic validation error array — take the first message
    return detail[0]?.msg || 'Error de validación'
  }
  if (typeof detail === 'string') {
    return detail
  }
  return 'Error'
}

export const useAuthStore = create((set, get) => ({
  user: null,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post('/v1/auth/login', { email, password })
      set({ user: { id: res.data.sub }, isLoading: false })
      return true
    } catch (err) {
      set({ error: extractErrorMessage(err), isLoading: false })
      return false
    }
  },

  register: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post('/v1/auth/register', data)
      set({ user: res.data, isLoading: false })
      return true
    } catch (err) {
      set({ error: extractErrorMessage(err), isLoading: false })
      return false
    }
  },

  logout: async () => {
    await api.post('/v1/auth/logout')
    set({ user: null, error: null })
    window.location.href = '/'
  },

  fetchMe: async () => {
    try {
      const res = await api.get('/v1/users/me')
      set({ user: res.data })
    } catch {
      set({ user: null })
    }
  },
}))
