import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../services/api'
import AddressForm, { serializeAddress, validateAddress } from '../components/AddressForm'
import { useAuthStore } from '../store/useAuthStore'

const METHOD_LABELS = {
  standard: 'Estándar (3-5 días hábiles)',
  express: 'Express (1-2 días hábiles)',
  pickup: 'Recoger en tienda',
}

const STATUS_LABELS = {
  pending: { label: 'Pendiente', badge: 'badge-amber' },
  processing: { label: 'En preparación', badge: 'badge-amber' },
  shipped: { label: 'Enviado', badge: 'badge-green' },
  delivered: { label: 'Entregado', badge: 'badge-green' },
  cancelled: { label: 'Cancelado', badge: 'badge-red' },
}

export default function Shipping() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [auction, setAuction] = useState(null)
  const [shipment, setShipment] = useState(null)
  const [method, setMethod] = useState('standard')
  const [address, setAddress] = useState(
    // Pre-llena con el domicilio guardado en el perfil del usuario si existe
    user?.shipping_address
      ? {
          zip_code: user.shipping_address.zip_code || '',
          estado: user.shipping_address.estado || '',
          municipio: user.shipping_address.municipio || '',
          colonia: user.shipping_address.colonia || '',
          street: user.shipping_address.street || '',
          references: user.shipping_address.references || '',
          country: 'México',
        }
      : { zip_code: '', estado: '', municipio: '', colonia: '', street: '', references: '', country: 'México' }
  )
  const [addrError, setAddrError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pageError, setPageError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    api.get(`/v1/auctions/${id}`)
      .then(res => setAuction(res.data))
      .catch(() => setPageError('No se pudo cargar la subasta'))

    api.get(`/v1/auctions/${id}/shipping`)
      .then(res => setShipment(res.data))
      .catch(() => {})
  }, [id])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (method !== 'pickup') {
      const err = validateAddress(address)
      if (err) { setAddrError(err); return }
    }
    setAddrError('')
    setLoading(true)

    try {
      const serialized = serializeAddress(address)
      await api.post(`/v1/auctions/${id}/shipping`, {
        method,
        address: method === 'pickup' ? {} : serialized,
      })
      setSuccess(true)
      setPageError('')
    } catch (err) {
      setPageError(err.response?.data?.detail || 'Error al registrar envío')
    }
    setLoading(false)
  }

  // ── Envío ya existe ─────────────────────────────────────────────────────────
  if (shipment) {
    const status = STATUS_LABELS[shipment.status] || { label: shipment.status, badge: 'badge-stone' }
    const addr = shipment.address
    return (
      <div className="section max-w-lg mx-auto fade-up">
        <div className="card p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-700">
                <rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-stone-900">Detalle de envío</h1>
              <p className="text-xs text-stone-400">{auction?.item?.title}</p>
            </div>
          </div>

          <div className="h-px bg-stone-100" />

          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-stone-400">Estado</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.badge}`}>{status.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Método</span>
              <span className="font-medium text-stone-800">{METHOD_LABELS[shipment.method] || shipment.method}</span>
            </div>
            {shipment.tracking_number && (
              <div className="flex justify-between">
                <span className="text-stone-400">Número de guía</span>
                <span className="font-medium text-stone-800 font-mono text-xs">{shipment.tracking_number}</span>
              </div>
            )}
            {shipment.method !== 'pickup' && addr && (
              <div className="pt-1">
                <span className="text-stone-400 block mb-1.5">Dirección de entrega</span>
                <div className="bg-stone-50 rounded-lg p-3 text-stone-700 space-y-0.5">
                  <p className="font-medium">{addr.street}</p>
                  {addr.colonia && <p className="text-stone-500">{addr.colonia}</p>}
                  <p className="text-stone-500">
                    {[addr.municipio, addr.estado].filter(Boolean).join(', ')}
                    {addr.zip_code && ` CP ${addr.zip_code}`}
                  </p>
                  {addr.country && <p className="text-stone-400 text-xs">{addr.country}</p>}
                  {addr.references && <p className="text-stone-400 text-xs mt-1">Ref: {addr.references}</p>}
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

  // ── Confirmación de éxito ───────────────────────────────────────────────────
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
          <p className="text-stone-500 text-sm">Hemos registrado tu información. Te notificaremos por correo y en la app cuando tu pedido sea enviado.</p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary w-full">
            Ir a mi cuenta
          </button>
        </div>
      </div>
    )
  }

  // ── Formulario de alta ──────────────────────────────────────────────────────
  return (
    <div className="section flex items-center justify-center py-12">
      <div className="card p-6 max-w-lg w-full">
        <h2 className="text-xl font-bold text-stone-900 mb-1">Seleccionar envío</h2>
        {auction && (
          <p className="text-stone-500 text-sm mb-6">
            {auction.item?.title} — <span className="font-medium">${Number(auction.final_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
          </p>
        )}

        {user?.shipping_address && (
          <div className="mb-5 rounded-lg bg-sky-50 border border-sky-200 px-3 py-2.5 text-xs text-sky-700">
            Hemos pre-llenado tu domicilio registrado. Puedes modificarlo si necesitas una dirección diferente.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Método */}
          <div>
            <label className="label">Método de envío</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(METHOD_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMethod(key)}
                  className={`border rounded-lg px-3 py-2.5 text-xs font-medium text-left transition-all ${
                    method === key
                      ? 'border-stone-800 bg-stone-800 text-white'
                      : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
                  }`}
                >
                  {key === 'standard' && '🚚 '}
                  {key === 'express' && '⚡ '}
                  {key === 'pickup' && '🏪 '}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Dirección (solo si no es pickup) */}
          {method !== 'pickup' && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-stone-700 mb-2">Dirección de entrega</p>
              <AddressForm value={address} onChange={setAddress} required />
              {addrError && (
                <p className="text-xs text-rose-600 mt-1">{addrError}</p>
              )}
            </div>
          )}

          {pageError && (
            <div className="flex items-center gap-2 text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
              </svg>
              {pageError}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary btn-lg w-full">
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
