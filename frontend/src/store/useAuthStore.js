import { create } from 'zustand'
import api from '../services/api'

const SESSION_KEY = 'sg_user'

function extractErrorMessage(err) {
  const detail = err?.response?.data?.detail
  if (Array.isArray(detail) && detail.length > 0) return detail[0]?.msg || 'Error de validación'
  if (typeof detail === 'string') return detail
  return 'Error'
}

function readSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) } catch { return null }
}
function writeSession(user) {
  if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user))
  else sessionStorage.removeItem(SESSION_KEY)
}

// Prevents concurrent fetchMe calls (React StrictMode runs effects twice)
let _fetchingMe = false

export const useAuthStore = create((set) => ({
  user: readSession(),   // sincrónico — sin parpadeo
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      await api.post('/v1/auth/login', { email, password })
      const me = await api.get('/v1/users/me')
      writeSession(me.data)
      set({ user: me.data, isLoading: false })
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
      writeSession(res.data)
      set({ user: res.data, isLoading: false })
      return true
    } catch (err) {
      set({ error: extractErrorMessage(err), isLoading: false })
      return false
    }
  },

  logout: async () => {
    await api.post('/v1/auth/logout').catch(() => {})
    writeSession(null)
    set({ user: null, error: null })
    window.location.href = '/'
  },

  // Only call this when there's an existing session to validate.
  // Guards against concurrent calls from React StrictMode.
  fetchMe: async () => {
    if (_fetchingMe) return
    if (!readSession()) return   // no session → nothing to validate
    _fetchingMe = true
    try {
      const res = await api.get('/v1/users/me')
      writeSession(res.data)
      // Only update state if user identity actually changed (avoids re-render on same session)
      set(state => state.user?.id === res.data.id ? state : { user: res.data })
    } catch {
      writeSession(null)
      set({ user: null })
    } finally {
      _fetchingMe = false
    }
  },
}))
