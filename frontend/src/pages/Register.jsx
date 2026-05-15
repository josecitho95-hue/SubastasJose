import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { firebaseAuth } from '../services/firebase'
import { useAuthStore } from '../store/useAuthStore'

const STEPS = [
  { icon: '01', title: 'Crea tu cuenta', desc: 'Registro rápido, menos de 2 minutos.' },
  { icon: '02', title: 'Verifica tu teléfono', desc: 'Código OTP por SMS para activar tu cuenta.' },
  { icon: '03', title: 'Deposita fondos', desc: 'Paga con tarjeta de forma segura.' },
  { icon: '04', title: '¡Puja!', desc: 'Compite en subastas en tiempo real.' },
]

// ── Google button ──────────────────────────────────────────────────────────────

function GoogleButton({ onSuccess, disabled }) {
  const { loginWithGoogle, error } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState('')

  const handleGoogle = async () => {
    setLoading(true)
    setLocalError('')
    try {
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(firebaseAuth, provider)
      const idToken = await result.user.getIdToken()
      const ok = await loginWithGoogle(idToken)
      if (ok) onSuccess()
    } catch (e) {
      setLocalError('No se pudo iniciar sesión con Google. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleGoogle}
        disabled={disabled || loading}
        className="w-full flex items-center justify-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-40"
      >
        {loading ? (
          <svg className="animate-spin h-4 w-4 text-stone-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 00-10 10h4z"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        )}
        Continuar con Google
      </button>
      {localError && <p className="text-xs text-rose-600 mt-1.5">{localError}</p>}
    </div>
  )
}

// ── OTP step ───────────────────────────────────────────────────────────────────

function OtpStep({ phone, onVerified }) {
  const { verifyOtp } = useAuthStore()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const confirmationRef = useRef(null)
  const recaptchaRef = useRef(null)

  const sendOtp = async () => {
    setSending(true)
    setError('')
    try {
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(firebaseAuth, 'recaptcha-container', {
          size: 'invisible',
        })
      }
      const confirmation = await signInWithPhoneNumber(firebaseAuth, phone, recaptchaRef.current)
      confirmationRef.current = confirmation
      setSent(true)
    } catch (e) {
      setError('No se pudo enviar el SMS. Verifica el número e intenta de nuevo.')
    } finally {
      setSending(false)
    }
  }

  const verifyCode = async () => {
    if (!confirmationRef.current) return
    setLoading(true)
    setError('')
    try {
      const result = await confirmationRef.current.confirm(code)
      const firebaseToken = await result.user.getIdToken()
      const ok = await verifyOtp(firebaseToken)
      if (ok) onVerified()
      else setError('Error al verificar. Intenta de nuevo.')
    } catch (e) {
      setError('Código incorrecto o expirado.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        <p className="font-medium mb-0.5">Verifica tu teléfono</p>
        <p className="text-xs text-amber-700">
          Enviamos un código de 6 dígitos a <span className="font-medium">{phone}</span>.
          Con esto podrás pujar en subastas hasta $500 MXN de inmediato.
        </p>
      </div>

      <div id="recaptcha-container" />

      {!sent ? (
        <button
          type="button"
          onClick={sendOtp}
          disabled={sending}
          className="btn-brand btn-lg w-full"
        >
          {sending ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 00-10 10h4z"/>
              </svg>
              Enviando SMS…
            </>
          ) : 'Enviar código SMS'}
        </button>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">Código de verificación</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="input text-center text-2xl tracking-widest font-mono"
              autoFocus
            />
          </div>
          <button
            type="button"
            onClick={verifyCode}
            disabled={loading || code.length < 6}
            className="btn-brand btn-lg w-full"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 00-10 10h4z"/>
                </svg>
                Verificando…
              </>
            ) : 'Confirmar código'}
          </button>
          <button type="button" onClick={() => setSent(false)} className="btn-ghost btn-sm w-full text-xs">
            ¿No recibiste el SMS? Reenviar
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
          {error}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Register() {
  const [step, setStep] = useState('form') // 'form' | 'otp'
  const [form, setForm] = useState({ email: '', password: '', full_name: '', phone: '' })
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const { register, error, isLoading } = useAuthStore()
  const navigate = useNavigate()

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    const ok = await register(form)
    if (ok) setStep('otp')
  }

  const handleVerified = () => navigate('/')

  return (
    <div className="min-h-[calc(100vh-57px)] flex">
      {/* Left panel */}
      <div className="hidden lg:flex w-2/5 flex-col justify-between p-12" style={{ background: 'var(--brand-navy)' }}>
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

        <div className="space-y-6">
          <h2 className="text-white text-2xl font-semibold leading-tight">
            Comienza a pujar<br/>en minutos
          </h2>
          <div className="space-y-5">
            {STEPS.map((s) => (
              <div key={s.icon} className="flex items-start gap-4">
                <span className="font-mono text-xs font-bold shrink-0 mt-0.5" style={{ color: 'var(--brand-cyan)' }}>{s.icon}</span>
                <div>
                  <p className="text-slate-200 text-sm font-medium">{s.title}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-600 text-xs">
          Plataforma regulada. Pagos procesados con Stripe.
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-stone-50">
        <div className="w-full max-w-sm fade-up">

          {step === 'otp' ? (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-stone-900">Verifica tu teléfono</h1>
                <p className="text-stone-500 text-sm mt-1.5">Último paso para activar tu cuenta</p>
              </div>
              <OtpStep phone={form.phone} onVerified={handleVerified} />
              <p className="text-center text-xs text-stone-400 mt-4">
                Puedes omitir esto y verificar después desde tu perfil.{' '}
                <button type="button" onClick={() => navigate('/')} className="underline hover:text-stone-600">
                  Ir al inicio
                </button>
              </p>
            </>
          ) : (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-stone-900">Crear cuenta</h1>
                <p className="text-stone-500 text-sm mt-1.5">
                  ¿Ya tienes cuenta?{' '}
                  <Link to="/login" className="font-medium hover:underline" style={{ color: 'var(--brand-cyan-dark)' }}>Inicia sesión</Link>
                </p>
              </div>

              {/* Google OAuth shortcut */}
              <GoogleButton onSuccess={() => navigate('/')} disabled={isLoading} />

              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-stone-200" />
                <span className="text-xs text-stone-400">o regístrate con correo</span>
                <div className="flex-1 h-px bg-stone-200" />
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
                  <label htmlFor="phone" className="label">
                    Teléfono{' '}
                    <span className="text-stone-400 normal-case font-normal text-xs">(para verificación OTP)</span>
                  </label>
                  <input id="phone" name="phone" type="tel" required value={form.phone}
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

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    id="terms_consent"
                    type="checkbox"
                    required
                    checked={privacyAccepted}
                    onChange={(e) => setPrivacyAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-stone-300 shrink-0" style={{ accentColor: 'var(--brand-cyan)' }}
                  />
                  <span className="text-xs text-stone-500 leading-relaxed">
                    He leído y acepto los{' '}
                    <a href="/terminos" target="_blank" rel="noopener noreferrer"
                      className="text-stone-700 font-medium underline hover:text-stone-900">
                      Términos y Condiciones
                    </a>{' '}
                    y el{' '}
                    <a href="/aviso-privacidad" target="_blank" rel="noopener noreferrer"
                      className="text-stone-700 font-medium underline hover:text-stone-900">
                      Aviso de Privacidad
                    </a>{' '}
                    de SubastasGeek, y autorizo el tratamiento de mis datos personales conforme a la LFPDPPP. Declaro ser mayor de 18 años con capacidad legal para contratar.
                  </span>
                </label>

                <button type="submit" disabled={isLoading || !privacyAccepted} className="btn-brand btn-lg w-full mt-2">
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
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
