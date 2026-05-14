/* Navbar component — clean, minimal, stone palette */
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import api from '../services/api'

export default function Navbar() {
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifs, setShowNotifs] = useState(false)
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    if (!user) return
    const fetchUnread = () => {
      api.get('/v1/notifications/unread-count')
        .then(r => setUnreadCount(r.data?.unread_count || 0))
        .catch(() => {})
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000)
    return () => clearInterval(interval)
  }, [user?.id])

  const loadNotifications = () => {
    if (!user) return
    api.get('/v1/notifications?limit=5')
      .then(r => setNotifications(r.data || []))
      .catch(() => {})
  }

  const markRead = async (notifId) => {
    await api.patch(`/v1/notifications/${notifId}/read`)
    setUnreadCount(Math.max(0, unreadCount - 1))
    loadNotifications()
  }

  const toggleNotifs = () => {
    if (!showNotifs) loadNotifications()
    setShowNotifs(!showNotifs)
  }

  const navLink = (to, label) => {
    const active = location.pathname === to
    return (
      <Link
        to={to}
        className={`text-sm transition-colors duration-150 ${
          active
            ? 'font-medium'
            : 'text-stone-500 hover:text-stone-800'
        }`}
        style={active ? { color: 'var(--brand-cyan-dark)' } : {}}
        onClick={() => setMobileOpen(false)}
      >
        {label}
      </Link>
    )
  }

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-stone-200/80">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150"
                  style={{ background: 'var(--brand-navy)' }}>
              {/* Gavel icon */}
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M2 13L6.5 8.5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                <rect x="5" y="1" width="8" height="3.5" rx="1"
                      fill="white" transform="rotate(45 9 2.75)"/>
                <circle cx="3.2" cy="11.8" r="1" fill="#06b6d4"/>
              </svg>
            </span>
            <span className="font-semibold tracking-tight leading-none">
              <span className="text-stone-900">subastas</span><span style={{ color: 'var(--brand-cyan)' }}>geek</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {navLink('/', 'Subastas')}
            {user && navLink('/dashboard', 'Mi cuenta')}
          </nav>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                {/* Notification bell */}
                <div className="relative">
                  <button
                    onClick={toggleNotifs}
                    className="relative p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 transition"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {unreadCount}
                      </span>
                    )}
                  </button>

                  {showNotifs && (
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-stone-200 py-2 z-50">
                      {notifications.length === 0 ? (
                        <p className="text-sm text-stone-400 px-4 py-3 text-center">Sin notificaciones</p>
                      ) : (
                        notifications.map(n => (
                          <button
                            key={n.id}
                            onClick={() => markRead(n.id)}
                            className={`w-full text-left px-4 py-2.5 hover:bg-stone-50 transition-colors ${n.is_read ? 'opacity-60' : ''}`}
                          >
                            <p className="text-sm font-medium text-stone-800">{n.title}</p>
                            <p className="text-xs text-stone-500 truncate">{n.message}</p>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <span className="text-xs text-stone-400 truncate max-w-[140px]">{user.email}</span>
                <button onClick={logout} className="btn-secondary btn-sm">
                  Cerrar sesión
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost btn-sm">Entrar</Link>
                <Link to="/register" className="btn-primary btn-sm">Crear cuenta</Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg text-stone-500 hover:bg-stone-100 transition"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menú"
          >
            {mobileOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18"/>
              </svg>
            )}
          </button>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden py-4 border-t border-stone-100 flex flex-col gap-4 fade-in">
            {navLink('/', 'Subastas activas')}
            {user && navLink('/dashboard', 'Mi cuenta')}
            <div className="pt-2 border-t border-stone-100 flex flex-col gap-2">
              {user ? (
                <button onClick={() => { logout(); setMobileOpen(false) }} className="btn-secondary btn-sm w-full">
                  Cerrar sesión
                </button>
              ) : (
                <>
                  <Link to="/login" onClick={() => setMobileOpen(false)} className="btn-ghost btn-sm w-full">Entrar</Link>
                  <Link to="/register" onClick={() => setMobileOpen(false)} className="btn-primary btn-sm w-full">Crear cuenta</Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
