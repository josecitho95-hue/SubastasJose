import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'

const STEPS = [
  { icon: '01', title: 'Crea tu cuenta', desc: 'Registro rápido, menos de 2 minutos.' },
  { icon: '02', title: 'Verifica tu identidad', desc: 'KYC básico para proteger tu cuenta.' },
  { icon: '03', title: 'Deposita fondos', desc: 'Paga con tarjeta de forma segura.' },
  { icon: '04', title: '¡Puja!', desc: 'Compite en subastas en tiempo real.' },
]

export default function Register() {
  const [form, setForm] = useState({ email: '', password: '', full_name: '', phone: '' })
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const { register, error, isLoading } = useAuthStore()
  const navigate = useNavigate()

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    const ok = await register(form)
    if (ok) navigate('/')
  }

  return (
    <div className="min-h-[calc(100vh-57px)] flex">
      {/* Left panel */}
      <div className="hidden lg:flex w-2/5 bg-stone-900 flex-col justify-between p-12">
        <Link to="/" className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 12L7 2L12 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3.5 9h7" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </span>
          <span className="text-white font-semibold">Subastas</span>
        </Link>

        <div className="space-y-6">
          <h2 className="text-white text-2xl font-semibold leading-tight">
            Comienza a pujar<br/>en minutos
          </h2>
          <div className="space-y-5">
            {STEPS.map((step) => (
              <div key={step.icon} className="flex items-start gap-4">
                <span className="text-stone-600 font-mono text-xs font-bold shrink-0 mt-0.5">{step.icon}</span>
                <div>
                  <p className="text-stone-200 text-sm font-medium">{step.title}</p>
                  <p className="text-stone-500 text-xs mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-stone-600 text-xs">
          Plataforma regulada. Pagos procesados con Stripe.
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-stone-50">
        <div className="w-full max-w-sm fade-up">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-stone-900">Crear cuenta</h1>
            <p className="text-stone-500 text-sm mt-1.5">
              ¿Ya tienes cuenta?{' '}
              <Link to="/login" className="text-stone-800 font-medium hover:underline">Inicia sesión</Link>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="full_name" className="label">Nombre completo</label>
              <input id="full_name" name="full_name" required value={form.full_name}
                onChange={handleChange} placeholder="María González" className="input" />
            </div>

            <div>
              <label htmlFor="email" className="label">Correo electrónico</label>
              <input id="email" name="email" type="email" required value={form.email}
                onChange={handleChange} placeholder="tu@correo.com" className="input" autoComplete="email" />
            </div>

            <div>
              <label htmlFor="phone" className="label">Teléfono <span className="text-stone-400 normal-case font-normal">(opcional)</span></label>
              <input id="phone" name="phone" type="tel" value={form.phone}
                onChange={handleChange} placeholder="+52 55 0000 0000" className="input" />
            </div>

            <div>
              <label htmlFor="password" className="label">Contraseña</label>
              <input id="password" name="password" type="password" required minLength={10}
                value={form.password} onChange={handleChange} placeholder="Mínimo 10 caracteres"
                className="input" autoComplete="new-password" />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5 text-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
                {error}
              </div>
            )}

            {/* Privacy consent — required before submitting */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                id="privacy_consent"
                type="checkbox"
                required
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-stone-300 text-stone-800 accent-stone-800 shrink-0"
              />
              <span className="text-xs text-stone-500 leading-relaxed">
                He leído y acepto el{' '}
                <a href="/aviso-privacidad" target="_blank" rel="noopener noreferrer"
                  className="text-stone-700 font-medium underline hover:text-stone-900">
                  Aviso de Privacidad
                </a>{' '}
                y autorizo el tratamiento de mis datos personales conforme a la LFPDPPP.
              </span>
            </label>

            <button type="submit" disabled={isLoading || !privacyAccepted} className="btn-primary btn-lg w-full mt-2">
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 00-10 10h4z"/>
                  </svg>
                  Creando cuenta…
                </>
              ) : 'Crear cuenta'}
            </button>

            <p className="text-center text-xs text-stone-400">
              Al registrarte también aceptas nuestros{' '}
              <a href="#" className="underline hover:text-stone-600">Términos de servicio</a>.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}

