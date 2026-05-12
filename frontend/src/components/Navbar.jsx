/* Navbar component — clean, minimal, stone palette */
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'

export default function Navbar() {
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navLink = (to, label) => {
    const active = location.pathname === to
    return (
      <Link
        to={to}
        className={`text-sm transition-colors duration-150 ${
          active
            ? 'text-stone-900 font-medium'
            : 'text-stone-500 hover:text-stone-800'
        }`}
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
            <span className="w-7 h-7 rounded-lg bg-stone-800 flex items-center justify-center
                             group-hover:bg-stone-700 transition-colors duration-150">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 12L7 2L12 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3.5 9h7" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </span>
            <span className="font-semibold text-stone-900 tracking-tight">Subastas</span>
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
