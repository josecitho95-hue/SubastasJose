import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import api from '../services/api'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_dummy')

const CARD_STYLE = {
  style: {
    base: {
      fontSize: '15px',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#1c1917',
      '::placeholder': { color: '#a8a29e' },
    },
    invalid: { color: '#e11d48' },
  },
}

function DepositForm() {
  const [amount, setAmount] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ text: '', ok: false })
  const stripe = useStripe()
  const elements = useElements()

  const createIntent = async () => {
    setLoading(true)
    setMessage({ text: '', ok: false })
    try {
      const res = await api.post('/v1/payments/deposit', { amount })
      setClientSecret(res.data.client_secret)
    } catch (err) {
      setMessage({ text: err.response?.data?.detail || 'Error al crear el pago', ok: false })
    }
    setLoading(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true)
    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: elements.getElement(CardElement) },
    })
    if (error) {
      setMessage({ text: error.message, ok: false })
    } else if (paymentIntent.status === 'succeeded') {
      setMessage({ text: '¡Depósito exitoso! Tu saldo ya está disponible.', ok: true })
      setClientSecret('')
      setAmount('')
    }
    setLoading(false)
  }

  return (
    <div className="card p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--brand-navy)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <rect x="1" y="4" width="22" height="16" rx="2"/>
            <path d="M1 10h22"/>
          </svg>
        </span>
        <div>
          <h2 className="font-semibold text-stone-900">Depositar fondos</h2>
          <p className="text-xs text-stone-400">Pago seguro con Stripe</p>
        </div>
      </div>

      <div className="divider" />

      {!clientSecret ? (
        <div className="space-y-4">
          <div>
            <label className="label">Monto a depositar (MXN)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 font-medium text-sm">$</span>
              <input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="input pl-7 text-lg font-semibold"
              />
            </div>
          </div>

          {/* Quick amounts */}
          <div className="flex gap-2 flex-wrap">
            {[100, 250, 500, 1000].map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className={`btn btn-sm rounded-full border text-xs transition-all ${
                  Number(amount) === v ? 'text-white border-transparent' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                }`}
                style={Number(amount) === v ? { background: 'var(--brand-cyan)', borderColor: 'var(--brand-cyan)' } : {}}
              >
                ${v.toLocaleString()}
              </button>
            ))}
          </div>

          {/* Topes regulatorios LFPIORPI */}
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 space-y-1.5">
            <p className="text-xs font-semibold text-stone-600 uppercase tracking-wide">Límites regulatorios (LFPIORPI)</p>
            <div className="text-xs text-stone-500 space-y-1">
              <div className="flex justify-between">
                <span>Por depósito</span>
                <span className="font-medium text-stone-700">$60,000 MXN</span>
              </div>
              <div className="flex justify-between">
                <span>Acumulado últimos 30 días</span>
                <span className="font-medium text-stone-700">$60,000 MXN</span>
              </div>
              <div className="flex justify-between">
                <span>Acumulado anual</span>
                <span className="font-medium text-stone-700">$180,000 MXN</span>
              </div>
            </div>
            <p className="text-xs text-stone-400 pt-1">
              Depósitos que superen estos límites serán rechazados automáticamente en cumplimiento de la ley antilavado.
            </p>
          </div>

          <button
            onClick={createIntent}
            disabled={loading || !amount}
            className="btn-primary btn-md w-full"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 00-10 10h4z"/>
                </svg>
                Procesando…
              </>
            ) : 'Continuar al pago'}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Datos de tarjeta</label>
            <div className="rounded-lg border border-stone-300 bg-white px-3.5 py-3 focus-within:border-brand-cyan transition-colors">
              <CardElement options={CARD_STYLE} />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-stone-400">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Encriptado con TLS. No almacenamos datos de tarjeta.
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-bid btn-lg w-full"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 00-10 10h4z"/>
                </svg>
                Procesando…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                Confirmar depósito — ${Number(amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setClientSecret('')}
            className="btn-ghost btn-sm w-full"
          >
            ← Cambiar monto
          </button>
        </form>
      )}

      {message.text && (
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm border ${
          message.ok
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-rose-50 text-rose-600 border-rose-200'
        }`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
            {message.ok
              ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
              : <><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></>
            }
          </svg>
          {message.text}
        </div>
      )}
    </div>
  )
}

export default function Deposit() {
  return (
    <div className="section max-w-md fade-up">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">Recargar wallet</h1>
        <p className="text-stone-500 text-sm mt-1">Agrega fondos para participar en subastas</p>
      </div>
      <Elements stripe={stripePromise}>
        <DepositForm />
      </Elements>
    </div>
  )
}
