import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { login, error, isLoading, user } = useAuthStore()
  const navigate = useNavigate()

  if (user) return <Navigate to="/" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    const ok = await login(email, password)
    if (ok) navigate('/')
  }

  return (
    <div className="min-h-[calc(100vh-57px)] flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12" style={{ background: 'var(--brand-navy)' }}>
        <Link to="/" className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.15)' }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M2 13L6.5 8.5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              <rect x="5" y="1" width="8" height="3.5" rx="1" fill="white" transform="rotate(45 9 2.75)"/>
              <circle cx="3.2" cy="11.8" r="1" fill="#06b6d4"/>
            </svg>
          </span>
          <span className="font-semibold tracking-tight leading-none">
            <span className="text-white">subastas</span><span style={{ color: 'var(--brand-cyan)' }}>geek</span>
          </span>
        </Link>

        <div>
          <blockquote className="text-slate-300 text-xl font-light leading-relaxed">
            "Gané mi colección favorita en la primera subasta. La experiencia fue increíble."
          </blockquote>
          <div className="mt-6 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white" style={{ background: 'var(--brand-cyan-dark)' }}>JG</div>
            <div>
              <p className="text-white text-sm font-medium">Juan García</p>
              <p className="text-xs" style={{ color: 'var(--brand-cyan)' }}>Coleccionista verificado</p>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="rounded-xl p-4 flex-1 border" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)' }}>
            <p className="text-2xl font-bold text-white">1,240+</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--brand-cyan)' }}>Subastas completadas</p>
          </div>
          <div className="rounded-xl p-4 flex-1 border" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)' }}>
            <p className="text-2xl font-bold text-white">100%</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--brand-cyan)' }}>Pagos seguros</p>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-stone-50">
        <div className="w-full max-w-sm fade-up">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-stone-900">Iniciar sesión</h1>
            <p className="text-stone-500 text-sm mt-1.5">
              ¿No tienes cuenta?{' '}
              <Link to="/register" className="font-medium hover:underline" style={{ color: 'var(--brand-cyan-dark)' }}>Regístrate gratis</Link>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="label">Correo electrónico</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="input"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Contraseña</label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                className="input"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5 text-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn-brand btn-lg w-full mt-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 00-10 10h4z"/>
                  </svg>
                  Entrando…
                </>
              ) : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

