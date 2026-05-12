import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import api from '../services/api'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_dummy')

function DepositForm() {
  const [amount, setAmount] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const stripe = useStripe()
  const elements = useElements()

  const createIntent = async () => {
    setLoading(true)
    try {
      const res = await api.post('/v1/payments/deposit', { amount })
      setClientSecret(res.data.client_secret)
      setMessage('')
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Error')
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
      setMessage(error.message)
    } else if (paymentIntent.status === 'succeeded') {
      setMessage('¡Depósito exitoso!')
      setClientSecret('')
      setAmount('')
    }
    setLoading(false)
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Depositar fondos</h2>

      {!clientSecret ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Monto (MXN)</label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <button
            onClick={createIntent}
            disabled={loading || !amount}
            className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Procesando...' : 'Continuar'}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="border rounded p-3">
            <CardElement options={{ style: { base: { fontSize: '16px' } } }} />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Procesando...' : 'Confirmar pago'}
          </button>
        </form>
      )}

      {message && <p className="mt-4 text-sm text-gray-700">{message}</p>}
    </div>
  )
}

export default function Deposit() {
  return (
    <div className="p-8 max-w-md mx-auto">
      <Elements stripe={stripePromise}>
        <DepositForm />
      </Elements>
    </div>
  )
}
