import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { login, error, isLoading } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    const ok = await login(email, password)
    if (ok) navigate('/')
  }

  return (
    <div className="min-h-[calc(100vh-57px)] flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex w-1/2 bg-stone-900 flex-col justify-between p-12">
        <Link to="/" className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 12L7 2L12 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3.5 9h7" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </span>
          <span className="text-white font-semibold tracking-tight">Subastas</span>
        </Link>

        <div>
          <blockquote className="text-stone-300 text-xl font-light leading-relaxed">
            "Participa en subastas exclusivas con la seguridad de que tu dinero está protegido."
          </blockquote>
          <div className="mt-6 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-stone-700 flex items-center justify-center text-stone-300 text-xs font-medium">JG</div>
            <div>
              <p className="text-white text-sm font-medium">Juan García</p>
              <p className="text-stone-500 text-xs">Comprador verificado</p>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="card p-4 bg-stone-800 border-stone-700 flex-1">
            <p className="text-2xl font-bold text-white">1,240+</p>
            <p className="text-stone-400 text-xs mt-0.5">Subastas completadas</p>
          </div>
          <div className="card p-4 bg-stone-800 border-stone-700 flex-1">
            <p className="text-2xl font-bold text-white">100%</p>
            <p className="text-stone-400 text-xs mt-0.5">Pagos seguros</p>
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
              <Link to="/register" className="text-stone-800 font-medium hover:underline">Regístrate gratis</Link>
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
              className="btn-primary btn-lg w-full mt-2"
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

