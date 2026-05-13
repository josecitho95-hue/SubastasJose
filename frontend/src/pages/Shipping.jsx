import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../services/api'

const METHOD_LABELS = {
  standard: 'Estándar (3-5 días)',
  express: 'Express (1-2 días)',
  pickup: 'Recoger en tienda',
}

const STATUS_LABELS = {
  pending: { label: 'Pendiente', badge: 'badge-amber' },
  shipped: { label: 'Enviado', badge: 'badge-green' },
  delivered: { label: 'Entregado', badge: 'badge-green' },
}

export default function Shipping() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [auction, setAuction] = useState(null)
  const [shipment, setShipment] = useState(null)
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
        setAuction(res.data)
      })
      .catch(() => setError('No se pudo cargar la subasta'))

    // Check if shipment already exists
    api.get(`/v1/auctions/${id}/shipping`)
      .then((res) => {
        setShipment(res.data)
      })
      .catch(() => {
        // No shipment yet — user can create one
      })
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

  // Show existing shipment
  if (shipment) {
    const status = STATUS_LABELS[shipment.status] || { label: shipment.status, badge: 'badge-stone' }
    return (
      <div className="section max-w-lg mx-auto fade-up">
        <div className="card p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-700">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-stone-900">Detalle de envío</h1>
              <p className="text-xs text-stone-400">{auction?.item?.title}</p>
            </div>
          </div>

          <div className="divider" />

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-stone-400">Estado</span>
              <span className={`badge text-xs ${status.badge}`}>{status.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Método</span>
              <span className="font-medium text-stone-800">{METHOD_LABELS[shipment.method] || shipment.method}</span>
            </div>
            {shipment.tracking_number && (
              <div className="flex justify-between">
                <span className="text-stone-400">Número de guía</span>
                <span className="font-medium text-stone-800 font-mono">{shipment.tracking_number}</span>
              </div>
            )}
            {shipment.method !== 'pickup' && (
              <div className="pt-2">
                <span className="text-stone-400 block mb-1">Dirección</span>
                <div className="bg-stone-50 rounded-lg p-3 text-stone-700">
                  <p>{shipment.address?.street}</p>
                  <p>{shipment.address?.city}, {shipment.address?.state}</p>
                  <p>CP {shipment.address?.zip}</p>
                  <p>{shipment.address?.country}</p>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2">
            <Link to="/dashboard" className="btn-secondary btn-sm w-full inline-flex justify-center">
              Volver al dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="section flex items-center justify-center py-24">
        <div className="card p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-700">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <h2 className="text-xl font-bold text-stone-900">¡Envío registrado!</h2>
          <p className="text-stone-500 text-sm">Hemos registrado tu método de envío. Te notificaremos cuando sea enviado.</p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary w-full">
            Ir a mi cuenta
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="section flex items-center justify-center py-12">
      <div className="card p-6 max-w-md w-full">
        <h2 className="text-xl font-bold text-stone-900 mb-1">Seleccionar envío</h2>
        {auction && (
          <p className="text-stone-500 text-sm mb-6">{auction.item?.title} — ${Number(auction.final_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Método de envío</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="input"
            >
              <option value="standard">Estándar (3-5 días)</option>
              <option value="express">Express (1-2 días)</option>
              <option value="pickup">Recoger en tienda</option>
            </select>
          </div>

          {method !== 'pickup' && (
            <>
              <div>
                <label className="label">Calle y número</label>
                <input
                  required
                  value={address.street}
                  onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Ciudad</label>
                  <input
                    required
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Estado</label>
                  <input
                    required
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="label">Código postal</label>
                <input
                  required
                  value={address.zip}
                  onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                  className="input"
                />
              </div>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary btn-lg w-full"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 00-10 10h4z"/>
                </svg>
                Registrando…
              </>
            ) : 'Confirmar envío'}
          </button>
        </form>
      </div>
    </div>
  )
}
