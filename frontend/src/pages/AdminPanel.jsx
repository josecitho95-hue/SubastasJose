import { useEffect, useState } from 'react'
import api from '../services/api'

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'auctions', label: 'Subastas' },
  { key: 'shipments', label: 'Envíos' },
  { key: 'users', label: 'Usuarios' },
  { key: 'kyc', label: 'KYC' },
]

const AUCTION_STATUS_BADGES = {
  scheduled: 'badge-stone',
  active: 'badge-green',
  closed: 'badge-emerald',
  closed_no_sale: 'badge-amber',
  cancelled: 'badge-red',
}

const PAYMENT_STATUS_BADGES = {
  pending: 'badge-amber',
  paid: 'badge-green',
  overdue: 'badge-red',
  refunded: 'badge-stone',
  not_required: 'badge-stone',
}

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [stats, setStats] = useState(null)
  const [finances, setFinances] = useState(null)
  const [auctions, setAuctions] = useState([])
  const [shipments, setShipments] = useState([])
  const [users, setUsers] = useState([])
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingAuction, setEditingAuction] = useState(null)
  const [editForm, setEditForm] = useState({})

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [s, q, a, sh, u] = await Promise.all([
        api.get('/v1/admin/dashboard').catch(() => ({ data: null })),
        api.get('/v1/documents/admin/kyc-queue').catch(() => ({ data: [] })),
        api.get('/v1/admin/auctions').catch(() => ({ data: [] })),
        api.get('/v1/admin/shipments').catch(() => ({ data: [] })),
        api.get('/v1/admin/users').catch(() => ({ data: [] })),
      ])
      setStats(s.data)
      setQueue(q.data)
      setAuctions(a.data)
      setShipments(sh.data)
      setUsers(u.data)

      const f = await api.get('/v1/admin/finances').catch(() => ({ data: null }))
      setFinances(f.data)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  const reviewDoc = async (docId, status, notes = '') => {
    const formData = new FormData()
    formData.append('status', status)
    formData.append('notes', notes)
    await api.post(`/v1/documents/admin/documents/${docId}/review`, formData)
    loadData()
  }

  const cancelAuction = async (auctionId) => {
    if (!confirm('¿Cancelar esta subasta? Se liberarán los saldos retenidos.')) return
    await api.delete(`/v1/admin/auctions/${auctionId}`)
    loadData()
  }

  const openEdit = (auction) => {
    setEditingAuction(auction.id)
    setEditForm({
      title: auction.item?.title || '',
      description: auction.item?.description || '',
      reserve_price: auction.item?.reserve_price || '',
      start_time: auction.start_time ? new Date(auction.start_time).toISOString().slice(0, 16) : '',
      end_time: auction.end_time ? new Date(auction.end_time).toISOString().slice(0, 16) : '',
    })
  }

  const saveEdit = async () => {
    const formData = new FormData()
    Object.entries(editForm).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) formData.append(k, v)
    })
    await api.put(`/v1/admin/auctions/${editingAuction}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    setEditingAuction(null)
    loadData()
  }

  const approvePayment = async (auctionId) => {
    if (!confirm('¿Aprobar el pago de esta subasta?')) return
    await api.patch(`/v1/admin/auctions/${auctionId}/approve-payment`)
    loadData()
  }

  const updateShipment = async (shipmentId, updates) => {
    const formData = new FormData()
    Object.entries(updates).forEach(([k, v]) => formData.append(k, v))
    await api.put(`/v1/admin/shipments/${shipmentId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    loadData()
  }

  const updateUser = async (userId, updates) => {
    await api.patch(`/v1/admin/users/${userId}`, updates)
    loadData()
  }

  if (loading) return <div className="p-8">Cargando…</div>

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold mb-4">Panel de Administración</h1>

      {/* Tabs */}
      <div className="border-b border-stone-200 flex gap-6 mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
              activeTab === t.key
                ? 'border-stone-800 text-stone-900'
                : 'border-transparent text-stone-400 hover:text-stone-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Dashboard Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {stats && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded shadow">
                <p className="text-sm text-stone-500">Usuarios</p>
                <p className="text-2xl font-bold">{stats.total_users}</p>
              </div>
              <div className="bg-white p-4 rounded shadow">
                <p className="text-sm text-stone-500">Subastas activas</p>
                <p className="text-2xl font-bold">{stats.active_auctions}</p>
              </div>
              <div className="bg-white p-4 rounded shadow">
                <p className="text-sm text-stone-500">KYC pendiente</p>
                <p className="text-2xl font-bold">{stats.pending_kyc}</p>
              </div>
            </div>
          )}

          {finances && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card p-4">
                <p className="text-xs text-stone-400 uppercase">Ingresos (charges)</p>
                <p className="text-xl font-bold text-stone-900">${Number(finances.total_charges).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-stone-400 uppercase">Depósitos</p>
                <p className="text-xl font-bold text-stone-900">${Number(finances.total_deposits).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-stone-400 uppercase">Penalizaciones</p>
                <p className="text-xl font-bold text-stone-900">${Number(finances.total_penalties).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-stone-400 uppercase">Retenido global</p>
                <p className="text-xl font-bold text-stone-900">${Number(finances.total_held_balance).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-stone-400 uppercase">Cerradas con venta</p>
                <p className="text-xl font-bold text-stone-900">{finances.closed_with_sale}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-stone-400 uppercase">Sin venta</p>
                <p className="text-xl font-bold text-stone-900">{finances.closed_no_sale}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Auctions Tab ────────────────────────────────────────────────────── */}
      {activeTab === 'auctions' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Título</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Precio</th>
                  <th className="px-4 py-3 text-left">Pago</th>
                  <th className="px-4 py-3 text-left">Ganador</th>
                  <th className="px-4 py-3 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {auctions.map(a => (
                  <tr key={a.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3 font-medium">{a.item?.title || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`badge text-xs ${AUCTION_STATUS_BADGES[a.status] || 'badge-stone'}`}>{a.status}</span>
                    </td>
                    <td className="px-4 py-3">${Number(a.current_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3">
                      <span className={`badge text-xs ${PAYMENT_STATUS_BADGES[a.payment_status] || 'badge-stone'}`}>{a.payment_status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {a.winning_bidder ? (
                        <div>
                          <p className="font-medium">{a.winning_bidder.full_name}</p>
                          <p className="text-xs text-stone-400">{a.winning_bidder.email}</p>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {a.status !== 'closed' && a.status !== 'cancelled' && (
                          <button onClick={() => openEdit(a)} className="btn-secondary btn-sm">Editar</button>
                        )}
                        {a.status !== 'cancelled' && a.status !== 'closed' && a.status !== 'closed_no_sale' && (
                          <button onClick={() => cancelAuction(a.id)} className="btn-danger btn-sm">Cancelar</button>
                        )}
                        {a.payment_status === 'paid' && !a.admin_payment_approved && (
                          <button onClick={() => approvePayment(a.id)} className="btn-primary btn-sm">Aprobar pago</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editingAuction && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 space-y-4">
                <h3 className="font-bold text-lg">Editar subasta</h3>
                <div>
                  <label className="label">Título</label>
                  <input className="input" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
                </div>
                <div>
                  <label className="label">Descripción</label>
                  <textarea className="input" rows={3} value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
                </div>
                <div>
                  <label className="label">Precio de reserva</label>
                  <input type="number" className="input" value={editForm.reserve_price} onChange={e => setEditForm({ ...editForm, reserve_price: e.target.value })} />
                </div>
                <div>
                  <label className="label">Inicio</label>
                  <input type="datetime-local" className="input" value={editForm.start_time} onChange={e => setEditForm({ ...editForm, start_time: e.target.value })} />
                </div>
                <div>
                  <label className="label">Fin</label>
                  <input type="datetime-local" className="input" value={editForm.end_time} onChange={e => setEditForm({ ...editForm, end_time: e.target.value })} />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={saveEdit} className="btn-primary w-full">Guardar</button>
                  <button onClick={() => setEditingAuction(null)} className="btn-secondary w-full">Cancelar</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Shipments Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'shipments' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Subasta</th>
                  <th className="px-4 py-3 text-left">Ganador</th>
                  <th className="px-4 py-3 text-left">Método</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Guía</th>
                  <th className="px-4 py-3 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {shipments.map(s => (
                  <ShipmentRow key={s.id} shipment={s} onUpdate={updateShipment} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Users Tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Nombre</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">KYC</th>
                  <th className="px-4 py-3 text-left">Activo</th>
                  <th className="px-4 py-3 text-left">Verificado</th>
                  <th className="px-4 py-3 text-left">Puede pujar</th>
                  <th className="px-4 py-3 text-left">Vencidos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3 font-medium">{u.full_name}</td>
                    <td className="px-4 py-3 text-stone-500">{u.email}</td>
                    <td className="px-4 py-3"><span className={`badge text-xs ${u.kyc_status === 'approved' ? 'badge-green' : u.kyc_status === 'rejected' ? 'badge-red' : 'badge-amber'}`}>{u.kyc_status}</span></td>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={u.is_active} onChange={e => updateUser(u.id, { is_active: e.target.checked })} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={u.is_verified} onChange={e => updateUser(u.id, { is_verified: e.target.checked })} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={u.can_bid} onChange={e => updateUser(u.id, { can_bid: e.target.checked })} />
                    </td>
                    <td className="px-4 py-3">{u.overdue_auctions_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── KYC Tab ─────────────────────────────────────────────────────────── */}
      {activeTab === 'kyc' && (
        <div className="bg-white rounded shadow p-6">
          <h2 className="font-semibold mb-4">Cola de KYC</h2>
          {queue.length === 0 ? (
            <p className="text-gray-500">No hay documentos pendientes.</p>
          ) : (
            <div className="space-y-3">
              {queue.map((doc) => (
                <div key={doc.id} className="border rounded p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium capitalize">{doc.type}</p>
                    <p className="text-sm text-gray-500">Subido: {new Date(doc.uploaded_at).toLocaleString()}</p>
                  </div>
                  <div className="space-x-2">
                    <button
                      onClick={() => reviewDoc(doc.id, 'approved')}
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                    >
                      Aprobar
                    </button>
                    <button
                      onClick={() => reviewDoc(doc.id, 'rejected')}
                      className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Editable Shipment Row ──────────────────────────────────────────────── */
function ShipmentRow({ shipment, onUpdate }) {
  const [status, setStatus] = useState(shipment.status)
  const [tracking, setTracking] = useState(shipment.tracking_number || '')

  const handleSave = () => {
    onUpdate(shipment.id, { status, tracking_number: tracking })
  }

  return (
    <tr className="hover:bg-stone-50">
      <td className="px-4 py-3 font-medium">{shipment.auction?.item?.title || '—'}</td>
      <td className="px-4 py-3">
        {shipment.winner ? (
          <div>
            <p>{shipment.winner.full_name}</p>
            <p className="text-xs text-stone-400">{shipment.winner.email}</p>
          </div>
        ) : '—'}
      </td>
      <td className="px-4 py-3 capitalize">{shipment.method}</td>
      <td className="px-4 py-3">
        <select className="input text-xs py-1" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="pending">Pendiente</option>
          <option value="shipped">Enviado</option>
          <option value="delivered">Entregado</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <input className="input text-xs py-1 w-32" value={tracking} onChange={e => setTracking(e.target.value)} placeholder="Guía" />
      </td>
      <td className="px-4 py-3">
        <button onClick={handleSave} className="btn-primary btn-sm">Guardar</button>
      </td>
    </tr>
  )
}
