import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'

export default function Shipping() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [auction, setAuction] = useState(null)
  const [method, setMethod] = useState('standard')
  const [address, setAddress] = useState({
    street: '',
    city: '',
    state: '',
    zip: '',
    country: 'México',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    api.get(`/v1/auctions/${id}`)
      .then((res) => {
        if (res.data.status !== 'closed') {
          setError('La subasta aún no ha terminado')
        } else if (res.data.winning_bidder_id !== res.data.current_user_id) {
          // We'll get current user from auth
        }
        setAuction(res.data)
      })
      .catch(() => setError('No se pudo cargar la subasta'))
  }, [id])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post(`/v1/auctions/${id}/shipping`, {
        method,
        address,
      })
      setSuccess(true)
      setError('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al registrar envío')
    }
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-green-600 mb-4">¡Envío registrado!</h2>
          <p className="text-gray-600 mb-4">Hemos registrado tu método de envío. Te notificaremos cuando sea enviado.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700"
          >
            Ir a mi cuenta
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow max-w-md w-full">
        <h2 className="text-2xl font-bold mb-2">Seleccionar envío</h2>
        {auction && (
          <p className="text-gray-500 mb-6">{auction.item?.title} — ${auction.final_price}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Método de envío</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="standard">Estándar (3-5 días)</option>
              <option value="express">Express (1-2 días)</option>
              <option value="pickup">Recoger en tienda</option>
            </select>
          </div>

          {method !== 'pickup' && (
            <>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Calle y número</label>
                <input
                  required
                  value={address.street}
                  onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Ciudad</label>
                  <input
                    required
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Estado</label>
                  <input
                    required
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Código postal</label>
                <input
                  required
                  value={address.zip}
                  onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
            </>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Registrando...' : 'Confirmar envío'}
          </button>
        </form>
      </div>
    </div>
  )
}
