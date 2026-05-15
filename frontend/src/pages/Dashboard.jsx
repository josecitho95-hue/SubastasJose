import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import KycUploader from '../components/KycUploader'

const KYC_LABELS = { pending: 'Pendiente', approved: 'Verificado', rejected: 'Rechazado' }
const KYC_BADGE = { pending: 'badge-amber', approved: 'badge-green', rejected: 'badge-red' }

const TX_TYPE_LABELS = {
  deposit: { label: 'Depósito', color: 'text-emerald-700 bg-emerald-50' },
  hold: { label: 'Retenido', color: 'text-amber-700 bg-amber-50' },
  release: { label: 'Liberado', color: 'text-stone-700 bg-stone-100' },
  charge: { label: 'Cobro', color: 'text-rose-700 bg-rose-50' },
  refund: { label: 'Reembolso', color: 'text-emerald-700 bg-emerald-50' },
  penalty: { label: 'Penalización', color: 'text-rose-700 bg-rose-50' },
}

const PAYMENT_STATUS_LABELS = {
  pending: { label: 'Pendiente de pago', badge: 'badge-amber' },
  paid: { label: 'Pagado', badge: 'badge-green' },
  overdue: { label: 'Vencido', badge: 'badge-red' },
  refunded: { label: 'Reembolsado', badge: 'badge-stone' },
  not_required: { label: 'N/A', badge: 'badge-stone' },
}

const SHIPPING_STATUS_LABELS = {
  pending_payment: { label: 'Esperando pago', badge: 'badge-amber' },
  processing: { label: 'Preparando envío', badge: 'badge-amber' },
  shipped: { label: 'Enviado', badge: 'badge-green' },
  delivered: { label: 'Entregado', badge: 'badge-green' },
  cancelled: { label: 'Cancelado', badge: 'badge-red' },
}

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [wallet, setWallet] = useState(null)
  const [dashData, setDashData] = useState({})
  const [transactions, setTransactions] = useState([])
  const [activeTab, setActiveTab] = useState('overview')
  const [payingAuction, setPayingAuction] = useState(null)
  const [editingAddress, setEditingAddress] = useState(false)
  const [addressForm, setAddressForm] = useState({ street: '', city: '', state: '', zip_code: '', country: 'México' })
  const [savingAddress, setSavingAddress] = useState(false)
  const [addressError, setAddressError] = useState('')

  useEffect(() => {
    api.get('/v1/users/me').then(r => setUser(r.data)).catch(() => {})
    api.get('/v1/payments/wallet').then(r => setWallet(r.data)).catch(() => {})
    api.get('/v1/users/me/dashboard').then(r => setDashData(r.data || {})).catch(() => {})
    loadTransactions()
  }, [])

  const loadTransactions = () => {
    api.get('/v1/users/me/transactions?limit=50')
      .then(r => setTransactions(r.data || []))
      .catch(() => {})
  }

  const handlePayAuction = async (auctionId) => {
    setPayingAuction(auctionId)
    try {
      await api.post(`/v1/auctions/${auctionId}/pay`)
      // Refresh dashboard data
      const dashRes = await api.get('/v1/users/me/dashboard')
      setDashData(dashRes.data || {})
      loadTransactions()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al procesar el pago')
    } finally {
      setPayingAuction(null)
    }
  }

  const openAddressEdit = () => {
    const addr = user?.shipping_address || {}
    setAddressForm({
      street: addr.street || '',
      city: addr.city || '',
      state: addr.state || '',
      zip_code: addr.zip_code || '',
      country: addr.country || 'México',
    })
    setAddressError('')
    setEditingAddress(true)
  }

  const saveAddress = async () => {
    setSavingAddress(true)
    setAddressError('')
    try {
      const res = await api.put('/v1/users/me', { shipping_address: addressForm })
      setUser(res.data)
      setEditingAddress(false)
    } catch (err) {
      setAddressError(err.response?.data?.detail || 'Error al guardar la dirección')
    } finally {
      setSavingAddress(false)
    }
  }

  if (!user) return (
    <div className="section flex items-center justify-center py-24 text-stone-400">
      <svg className="animate-spin h-7 w-7" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 00-10 10h4z"/>
      </svg>
    </div>
  )

  const activeBids = dashData.active_bids || []
  const wonAuctions = dashData.auctions_won || []
  const initials = user.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  const tabBtn = (key, label) => (
    <button
      key={key}
      onClick={() => setActiveTab(key)}
      className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
        activeTab === key
          ? 'text-stone-900'
          : 'border-transparent text-stone-400 hover:text-stone-600'
      }`}
      style={activeTab === key ? { borderColor: 'var(--brand-cyan)', color: 'var(--brand-cyan-dark)' } : {}}
    >
      {label}
    </button>
  )

  return (
    <div className="section space-y-6 fade-up">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Mi cuenta</h1>
          <p className="text-stone-500 text-sm mt-0.5">Gestiona tus subastas, wallet y verificación</p>
        </div>
        {user.is_admin && (
          <Link to="/admin" className="btn-secondary btn-sm">
            Panel de admin
          </Link>
        )}
      </div>

      {/* ── Top stats row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Profile card */}
        <div className="card p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0" style={{ background: 'var(--brand-navy)' }}>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-stone-800 truncate">{user.full_name}</p>
            <p className="text-xs text-stone-400 truncate">{user.email}</p>
            <span className={`${KYC_BADGE[user.kyc_status] || 'badge-stone'} mt-1.5 inline-flex`}>
              {KYC_LABELS[user.kyc_status] || user.kyc_status}
            </span>
          </div>
        </div>

        {/* Wallet card */}
        <div className="card p-5">
          <p className="text-xs text-stone-400 mb-1 uppercase tracking-wide font-medium">Saldo disponible</p>
          {wallet ? (
            <>
              <p className="text-2xl font-bold text-stone-900">
                ${Number(wallet.balance).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-stone-400 mt-1">
                Retenido: ${Number(wallet.held_balance).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </p>
              <Link to="/deposit" className="btn-brand btn-sm mt-4 inline-flex">
                + Depositar
              </Link>
            </>
          ) : (
            <p className="text-stone-400 text-sm mt-2">Sin billetera configurada</p>
          )}
        </div>

        {/* Stats card */}
        <div className="card p-5 grid grid-cols-2 gap-4">
          <div>
            <p className="text-2xl font-bold text-stone-900">{activeBids.length}</p>
            <p className="text-xs text-stone-400 mt-0.5">Pujas activas</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-stone-900">{wonAuctions.length}</p>
            <p className="text-xs text-stone-400 mt-0.5">Subastas ganadas</p>
          </div>
          <div className="col-span-2 border-t border-stone-100 pt-3">
            <p className="text-xs text-stone-400">Nivel KYC</p>
            <p className="text-sm font-semibold text-stone-700 capitalize mt-0.5">{user.kyc_level}</p>
          </div>
        </div>
      </div>

      {/* ── KYC banner ───────────────────────────────────────────────────────── */}
      {user.kyc_status !== 'approved' && (
        <div className="card p-5 border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-600 mt-0.5 shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div className="flex-1">
              <p className="font-semibold text-amber-800 text-sm">Verifica tu identidad para pujar</p>
              <p className="text-amber-700 text-xs mt-0.5">Sube tus documentos para completar el proceso KYC.</p>
            </div>
          </div>
          <div className="mt-4">
            <KycUploader />
          </div>
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="border-b border-stone-200 flex gap-6">
        {tabBtn('overview', 'Resumen')}
        {tabBtn('transactions', 'Movimientos')}
        {tabBtn('won', 'Subastas ganadas')}
        {tabBtn('misdatos', 'Mis Datos')}
      </div>

      {/* ── Tab: Overview ───────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="card">
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
            <h2 className="font-semibold text-stone-800">Pujas activas</h2>
            <span className="badge-stone">{activeBids.length}</span>
          </div>
          {activeBids.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-stone-400">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9.5 2h5l1.5 3H8L9.5 2zM3 8h18l-2 13H5L3 8z"/>
              </svg>
              <p className="text-sm mt-3">No tienes pujas activas</p>
              <Link to="/" className="btn-ghost btn-sm mt-3">Explorar subastas</Link>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {activeBids.map(b => (
                <div key={b.id} className="px-5 py-3 flex items-center justify-between hover:bg-stone-50 transition-colors">
                  <div>
                    <Link to={`/auction/${b.auction_id}`} className="text-sm font-medium text-stone-800 hover:underline">
                      Subasta {b.auction_id?.slice(0, 8)}…
                    </Link>
                    <p className="text-xs text-stone-400">{new Date(b.placed_at).toLocaleString('es-MX')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-stone-900">
                      ${Number(b.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </p>
                    {b.is_winning && <span className="badge-green text-xs">Líder</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Transactions ───────────────────────────────────────────────── */}
      {activeTab === 'transactions' && (
        <div className="card">
          <div className="px-5 py-4 border-b border-stone-100">
            <h2 className="font-semibold text-stone-800">Historial de movimientos</h2>
          </div>
          {transactions.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-stone-400">
              <p className="text-sm">Sin movimientos registrados</p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {transactions.map(tx => {
                const style = TX_TYPE_LABELS[tx.type] || { label: tx.type, color: 'text-stone-700 bg-stone-100' }
                return (
                  <div key={tx.id} className="px-5 py-3 flex items-center justify-between hover:bg-stone-50 transition-colors">
                    <div>
                      <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded ${style.color}`}>
                        {style.label}
                      </span>
                      <p className="text-xs text-stone-400 mt-1">{tx.description || ''}</p>
                      <p className="text-xs text-stone-400">{new Date(tx.created_at).toLocaleString('es-MX')}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${tx.type === 'deposit' || tx.type === 'release' || tx.type === 'refund' ? 'text-emerald-700' : 'text-stone-900'}`}>
                        {tx.type === 'deposit' || tx.type === 'release' || tx.type === 'refund' ? '+' : '-'}${Number(tx.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-stone-400 capitalize">{tx.status}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Won Auctions ───────────────────────────────────────────────── */}
      {activeTab === 'won' && (
        <div className="space-y-4">
          {wonAuctions.length === 0 ? (
            <div className="card py-12 flex flex-col items-center text-stone-400">
              <p className="text-sm">No has ganado ninguna subasta aún</p>
              <Link to="/" className="btn-ghost btn-sm mt-3">Explorar subastas</Link>
            </div>
          ) : (
            wonAuctions.map(a => {
              const ps = PAYMENT_STATUS_LABELS[a.payment_status] || { label: a.payment_status, badge: 'badge-stone' }
              const ss = SHIPPING_STATUS_LABELS[a.shipping_status] || { label: a.shipping_status, badge: 'badge-stone' }
              const isPending = a.payment_status === 'pending'
              const isPaid = a.payment_status === 'paid'
              const isOverdue = a.payment_status === 'overdue'
              const deadline = a.payment_deadline ? new Date(a.payment_deadline) : null
              const timeLeft = deadline ? Math.max(0, deadline - Date.now()) : 0
              const hoursLeft = Math.floor(timeLeft / 3600000)
              const minsLeft = Math.floor((timeLeft % 3600000) / 60000)

              return (
                <div key={a.id} className="card p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {a.image_thumb ? (
                        <img src={`/uploads/${a.image_thumb}`} alt="" className="w-12 h-12 rounded-lg object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-stone-100 flex items-center justify-center">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-stone-300">
                            <rect x="3" y="3" width="18" height="18" rx="3"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <path d="m21 15-5-5L5 21"/>
                          </svg>
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-stone-800 text-sm">{a.title || `Subasta ${a.id?.slice(0, 8)}…`}</p>
                        <p className="text-xs text-stone-400">${Number(a.final_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                    <span className={`badge text-xs ${ps.badge}`}>{ps.label}</span>
                  </div>

                  {isPending && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-amber-800 font-medium">Pago pendiente</p>
                          <p className="text-xs text-amber-700">Tiempo restante: {hoursLeft}h {minsLeft}min</p>
                        </div>
                        <button
                          onClick={() => handlePayAuction(a.id)}
                          disabled={payingAuction === a.id}
                          className="btn-bid btn-sm"
                        >
                          {payingAuction === a.id ? 'Procesando…' : 'Pagar ahora'}
                        </button>
                      </div>
                    </div>
                  )}

                  {isPaid && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`badge text-xs ${ss.badge}`}>{ss.label}</span>
                        {a.admin_payment_approved && <span className="badge-green text-xs">Pago aprobado por admin</span>}
                      </div>
                      <Link to={`/auction/${a.id}/shipping`} className="btn-secondary btn-sm inline-flex">
                        Ver detalle de envío
                      </Link>
                    </div>
                  )}

                  {isOverdue && (
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
                      <p className="text-sm text-rose-800 font-medium">Pago vencido</p>
                      <p className="text-xs text-rose-700">Perdiste esta subasta por no pagar a tiempo. Se aplicaron las penalizaciones correspondientes.</p>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
      {/* ── Tab: Mis Datos (ARCO) ───────────────────────────────────────────── */}
      {activeTab === 'misdatos' && (
        <div className="space-y-4">
          {/* Datos en sistema */}
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-stone-800">Datos registrados</h2>
            <div className="divide-y divide-stone-100 text-sm">
              {[
                { label: 'Nombre completo', value: user.full_name },
                { label: 'Correo electrónico', value: user.email },
                { label: 'Teléfono', value: user.phone || '—' },
                { label: 'Estado KYC', value: KYC_LABELS[user.kyc_status] || user.kyc_status },
                { label: 'Nivel KYC', value: user.kyc_level === 'basic' ? 'Básico (INE)' : 'Mejorado' },
                { label: 'Miembro desde', value: user.created_at ? new Date(user.created_at).toLocaleDateString('es-MX') : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="py-2.5 flex justify-between gap-4">
                  <span className="text-stone-400">{label}</span>
                  <span className="text-stone-700 font-medium text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Dirección de envío */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-stone-800">Dirección de envío</h2>
              {!editingAddress && (
                <button onClick={openAddressEdit} className="btn-secondary btn-sm">
                  {user.shipping_address ? 'Editar' : '+ Agregar'}
                </button>
              )}
            </div>

            {!editingAddress ? (
              user.shipping_address ? (
                <div className="rounded-lg bg-stone-50 border border-stone-200 px-4 py-3 text-sm text-stone-700 space-y-0.5">
                  {user.shipping_address.street && <p>{user.shipping_address.street}</p>}
                  <p>
                    {[user.shipping_address.city, user.shipping_address.state, user.shipping_address.zip_code]
                      .filter(Boolean).join(', ')}
                  </p>
                  {user.shipping_address.country && <p className="text-stone-400">{user.shipping_address.country}</p>}
                </div>
              ) : (
                <p className="text-sm text-stone-400">No has registrado una dirección de envío todavía.</p>
              )
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="label">Calle y número</label>
                  <input
                    className="input"
                    placeholder="Ej. Av. Insurgentes Sur 1234, Col. Del Valle"
                    value={addressForm.street}
                    onChange={e => setAddressForm({ ...addressForm, street: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Ciudad</label>
                    <input
                      className="input"
                      placeholder="Ciudad de México"
                      value={addressForm.city}
                      onChange={e => setAddressForm({ ...addressForm, city: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Estado</label>
                    <input
                      className="input"
                      placeholder="CDMX"
                      value={addressForm.state}
                      onChange={e => setAddressForm({ ...addressForm, state: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Código postal</label>
                    <input
                      className="input"
                      placeholder="03100"
                      value={addressForm.zip_code}
                      onChange={e => setAddressForm({ ...addressForm, zip_code: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">País</label>
                    <input
                      className="input"
                      value={addressForm.country}
                      onChange={e => setAddressForm({ ...addressForm, country: e.target.value })}
                    />
                  </div>
                </div>
                {addressError && <p className="text-xs text-rose-600">{addressError}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={saveAddress}
                    disabled={savingAddress}
                    className="btn-primary btn-sm"
                  >
                    {savingAddress ? 'Guardando…' : 'Guardar dirección'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingAddress(false)}
                    className="btn-secondary btn-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Derechos ARCO */}
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-stone-800">Tus Derechos ARCO</h2>
            <p className="text-sm text-stone-500 leading-relaxed">
              Conforme a la <strong>Ley Federal de Protección de Datos Personales (LFPDPPP)</strong>, tienes derecho a:
            </p>
            <ul className="text-sm text-stone-600 space-y-2">
              {[
                ['Acceso', 'Conocer qué datos personales tenemos sobre ti y cómo los usamos.'],
                ['Rectificación', 'Corregir datos incorrectos, inexactos o incompletos.'],
                ['Cancelación', 'Solicitar la eliminación de tus datos cuando ya no sean necesarios.'],
                ['Oposición', 'Oponerte al tratamiento de tus datos para finalidades secundarias (marketing, encuestas).'],
              ].map(([right, desc]) => (
                <li key={right} className="flex gap-2.5">
                  <span className="font-semibold text-stone-800 shrink-0 w-24">{right}</span>
                  <span className="text-stone-500">{desc}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 rounded-lg bg-stone-50 border border-stone-200 px-4 py-3 text-sm text-stone-600">
              Para ejercer cualquiera de estos derechos, envía un correo a{' '}
              <a href="mailto:privacidad@subastasgeek.com" className="font-medium text-stone-800 underline hover:text-stone-900">
                privacidad@subastasgeek.com
              </a>{' '}
              indicando tu nombre, el derecho a ejercer y una copia de tu identificación. Responderemos en un máximo de <strong>20 días hábiles</strong>.
            </div>
            <a href="/aviso-privacidad" target="_blank" rel="noopener noreferrer"
              className="text-xs text-stone-400 underline hover:text-stone-600">
              Consultar Aviso de Privacidad completo
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
