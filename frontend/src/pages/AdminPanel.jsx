import { useEffect, useState } from 'react'
import api from '../services/api'

const toLocalISO = (utcStr) => {
  const d = new Date(utcStr)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const toUTCISO = (localStr) => new Date(localStr).toISOString()

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'auctions', label: 'Subastas' },
  { key: 'shipments', label: 'Envíos' },
  { key: 'products', label: 'Productos' },
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

const SHIPPING_STATUS_LABELS = {
  pending_payment: 'Esperando pago',
  processing: 'En proceso',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [stats, setStats] = useState(null)
  const [finances, setFinances] = useState(null)
  const [auctions, setAuctions] = useState([])
  const [shipments, setShipments] = useState([])
  const [users, setUsers] = useState([])
  const [queue, setQueue] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingAuction, setEditingAuction] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [showItemModal, setShowItemModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [itemForm, setItemForm] = useState({
    title: '',
    description: '',
    category: '',
    condition: 'new',
    starting_price: '',
    reserve_price: '',
    min_bid_increment: '1.00',
  })
  const [itemImages, setItemImages] = useState([])
  const [auctionItem, setAuctionItem] = useState(null)
  const [auctionForm, setAuctionForm] = useState({ start_time: '', end_time: '' })
  const [shippingAuction, setShippingAuction] = useState(null)
  const [shippingForm, setShippingForm] = useState({ shipping_status: 'processing', tracking_note: '' })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [s, q, a, sh, u, i] = await Promise.all([
        api.get('/v1/admin/dashboard').catch(() => ({ data: null })),
        api.get('/v1/documents/admin/kyc-queue').catch(() => ({ data: [] })),
        api.get('/v1/admin/auctions').catch(() => ({ data: [] })),
        api.get('/v1/admin/shipments').catch(() => ({ data: [] })),
        api.get('/v1/admin/users').catch(() => ({ data: [] })),
        api.get('/v1/items').catch(() => ({ data: [] })),
      ])
      setStats(s.data)
      setQueue(q.data)
      setAuctions(a.data)
      setShipments(sh.data)
      setUsers(u.data)
      setItems(i.data)

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
      start_time: auction.start_time ? toLocalISO(auction.start_time) : '',
      end_time: auction.end_time ? toLocalISO(auction.end_time) : '',
    })
  }

  const saveEdit = async () => {
    const params = {}
    Object.entries(editForm).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) params[k] = v
    })
    if (params.start_time) params.start_time = toUTCISO(params.start_time)
    if (params.end_time) params.end_time = toUTCISO(params.end_time)
    try {
      await api.put(`/v1/admin/auctions/${editingAuction}`, null, { params })
      setEditingAuction(null)
      loadData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al guardar subasta')
    }
  }

  const chargeWinner = async (auction) => {
    const amount = Number(auction.final_price || auction.current_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })
    const winner = auction.winning_bidder ? auction.winning_bidder.full_name : 'ganador'
    if (!confirm(`¿Cobrar $${amount} MXN al ${winner}?\nEsta acción descuenta el monto del saldo retenido y no se puede revertir.`)) return
    try {
      await api.patch(`/v1/admin/auctions/${auction.id}/charge-winner`)
      loadData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al cobrar al ganador')
    }
  }

  const approvePayment = async (auctionId) => {
    if (!confirm('¿Aprobar el pago de esta subasta?')) return
    await api.patch(`/v1/admin/auctions/${auctionId}/approve-payment`)
    loadData()
  }

  const updateShipment = async (shipmentId, updates) => {
    try {
      await api.put(`/v1/admin/shipments/${shipmentId}`, null, { params: updates })
      loadData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al actualizar envío')
    }
  }

  const updateUser = async (userId, updates) => {
    const params = new URLSearchParams()
    Object.entries(updates).forEach(([k, v]) => params.append(k, String(v)))
    await api.patch(`/v1/admin/users/${userId}?${params.toString()}`)
    loadData()
  }

  /* ─── Product helpers ──────────────────────────────────────────────────── */

  const openItemModal = (item = null) => {
    if (item) {
      setEditingItem(item.id)
      setItemForm({
        title: item.title || '',
        description: item.description || '',
        category: item.category || '',
        condition: item.condition || 'new',
        starting_price: item.starting_price || '',
        reserve_price: item.reserve_price || '',
        min_bid_increment: item.min_bid_increment || '1.00',
      })
    } else {
      setEditingItem(null)
      setItemForm({
        title: '',
        description: '',
        category: '',
        condition: 'new',
        starting_price: '',
        reserve_price: '',
        min_bid_increment: '1.00',
      })
    }
    setItemImages([])
    setShowItemModal(true)
  }

  const saveItem = async () => {
    if (itemImages.length > 5) {
      alert('Máximo 5 imágenes permitidas')
      return
    }
    const formData = new FormData()
    Object.entries(itemForm).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) formData.append(k, v)
    })
    itemImages.forEach((file) => formData.append('images', file))

    try {
      if (editingItem) {
        await api.put(`/v1/items/${editingItem}`, formData, {
          headers: { 'Content-Type': undefined }
        })
      } else {
        await api.post('/v1/items', formData, {
          headers: { 'Content-Type': undefined }
        })
      }
      setShowItemModal(false)
      setEditingItem(null)
      loadData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al guardar producto')
    }
  }

  const deleteItem = async (itemId) => {
    if (!confirm('¿Eliminar este producto? No se puede recuperar.')) return
    try {
      await api.delete(`/v1/items/${itemId}`)
      loadData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al eliminar producto')
    }
  }

  const openAuctionModal = (item) => {
    const now = new Date()
    const oneHour = new Date(now.getTime() + 60 * 60 * 1000)
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    const fmt = (d) => toLocalISO(d.toISOString())
    setAuctionItem(item)
    setAuctionForm({ start_time: fmt(oneHour), end_time: fmt(threeDays) })
  }

  const openShippingModal = (auction) => {
    setShippingAuction(auction)
    setShippingForm({
      shipping_status: auction.shipping_status === 'pending_payment' ? 'processing' : auction.shipping_status,
      tracking_note: '',
    })
  }

  const saveShipping = async () => {
    const params = { shipping_status: shippingForm.shipping_status }
    if (shippingForm.tracking_note) params.tracking_note = shippingForm.tracking_note
    try {
      await api.patch(`/v1/admin/auctions/${shippingAuction.id}/shipping`, null, { params })
      setShippingAuction(null)
      loadData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al actualizar envío')
    }
  }

  const saveAuction = async () => {
    const formData = new FormData()
    formData.append('item_id', auctionItem.id)
    formData.append('start_time', toUTCISO(auctionForm.start_time))
    formData.append('end_time', toUTCISO(auctionForm.end_time))
    try {
      await api.post('/v1/auctions', formData, { headers: { 'Content-Type': undefined } })
      setAuctionItem(null)
      setActiveTab('auctions')
      loadData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al crear subasta')
    }
  }

  if (loading) return <div className="p-8">Cargando…</div>

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold mb-4">Panel de Administración</h1>

      {/* Tabs */}
      <div className="border-b border-stone-200 flex gap-6 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`text-sm font-medium pb-2 border-b-2 transition-colors whitespace-nowrap ${
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
                  <th className="px-4 py-3 text-left">Envío</th>
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
                    <td className="px-4 py-3 text-xs text-stone-500">
                      {SHIPPING_STATUS_LABELS[a.shipping_status] || a.shipping_status}
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
                      <div className="flex gap-2 flex-wrap">
                        {a.status !== 'closed' && a.status !== 'cancelled' && a.status !== 'closed_no_sale' && (
                          <button onClick={() => openEdit(a)} className="btn-secondary btn-sm">Editar</button>
                        )}
                        {a.status !== 'cancelled' && a.status !== 'closed' && a.status !== 'closed_no_sale' && (
                          <button onClick={() => cancelAuction(a.id)} className="btn-danger btn-sm">Cancelar</button>
                        )}
                        {a.status === 'closed' && a.winning_bidder_id && a.payment_status === 'pending' && (
                          <button
                            onClick={() => chargeWinner(a)}
                            className="btn-sm bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded px-3 py-1 text-xs"
                          >
                            💳 Cobrar ganador
                          </button>
                        )}
                        {a.payment_status === 'paid' && !a.admin_payment_approved && (
                          <button onClick={() => approvePayment(a.id)} className="btn-primary btn-sm">Aprobar pago</button>
                        )}
                        {a.admin_payment_approved && a.shipping_status !== 'delivered' && a.shipping_status !== 'cancelled' && (
                          <button
                            onClick={() => openShippingModal(a)}
                            className="btn-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded px-3 py-1 text-xs"
                          >
                            📦 Envío
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {shippingAuction && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6 space-y-4">
                <div>
                  <h3 className="font-bold text-lg">Gestionar envío</h3>
                  <p className="text-sm text-stone-500 mt-1">{shippingAuction.item?.title}</p>
                  {shippingAuction.winning_bidder && (
                    <div className="mt-2 text-xs text-stone-500 space-y-0.5">
                      <p>Ganador: <span className="font-medium text-stone-700">{shippingAuction.winning_bidder.full_name}</span></p>
                      <p>Correo: {shippingAuction.winning_bidder.email}</p>
                      {shippingAuction.winning_bidder.phone && <p>Teléfono: {shippingAuction.winning_bidder.phone}</p>}
                    </div>
                  )}
                </div>

                {(() => {
                  const addr = shippingAuction.winning_bidder?.shipping_address
                  if (!addr) return (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                      El ganador no tiene domicilio registrado. Se lo solicitará al crear el envío.
                    </div>
                  )
                  return (
                    <div className="rounded-lg bg-stone-50 border border-stone-200 px-3 py-3 text-sm space-y-1">
                      <p className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-2">Domicilio de envío</p>
                      <p className="text-stone-700">{addr.street}</p>
                      <p className="text-stone-600">{addr.city}, {addr.state} {addr.zip_code}</p>
                      <p className="text-stone-500">{addr.country}</p>
                      {addr.references && <p className="text-stone-400 text-xs">Ref: {addr.references}</p>}
                    </div>
                  )
                })()}

                <div>
                  <label className="label">Estado de envío</label>
                  <select
                    className="input"
                    value={shippingForm.shipping_status}
                    onChange={e => setShippingForm({ ...shippingForm, shipping_status: e.target.value })}
                  >
                    <option value="processing">En proceso (preparando)</option>
                    <option value="shipped">Enviado</option>
                    <option value="delivered">Entregado</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
                <div>
                  <label className="label">Número de guía / nota <span className="text-stone-400 font-normal">(opcional)</span></label>
                  <input
                    className="input"
                    placeholder="Ej. 1Z999AA10123456784"
                    value={shippingForm.tracking_note}
                    onChange={e => setShippingForm({ ...shippingForm, tracking_note: e.target.value })}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={saveShipping} className="btn-primary w-full">Guardar y notificar</button>
                  <button onClick={() => setShippingAuction(null)} className="btn-secondary w-full">Cancelar</button>
                </div>
              </div>
            </div>
          )}

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
                  <th className="px-4 py-3 text-left">Acciones / Dir.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {shipments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-stone-400 text-sm">
                      No hay envíos registrados aún. Los envíos aparecen cuando un ganador completa su dirección de entrega.
                    </td>
                  </tr>
                ) : (
                  shipments.map(s => (
                    <ShipmentRow key={s.id} shipment={s} onUpdate={updateShipment} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Products Tab ────────────────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-stone-800">Productos</h2>
            <button onClick={() => openItemModal()} className="btn-primary btn-sm">+ Nuevo producto</button>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Imagen</th>
                    <th className="px-4 py-3 text-left">Título</th>
                    <th className="px-4 py-3 text-left">Categoría</th>
                    <th className="px-4 py-3 text-left">Condición</th>
                    <th className="px-4 py-3 text-left">Precio inicial</th>
                    <th className="px-4 py-3 text-left">Subasta</th>
                    <th className="px-4 py-3 text-left">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {items.map(item => {
                    const linkedAuction = auctions.find(a => a.item?.id === item.id && ['active', 'scheduled'].includes(a.status))
                    return (
                    <tr key={item.id} className="hover:bg-stone-50">
                      <td className="px-4 py-3">
                        {item.images && item.images.length > 0 ? (
                          <img src={`/uploads/${item.images[0]}`} alt="" className="w-10 h-10 rounded object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-stone-100 flex items-center justify-center">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-stone-300">
                              <rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
                            </svg>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{item.title}</td>
                      <td className="px-4 py-3 text-stone-500 capitalize">{item.category}</td>
                      <td className="px-4 py-3 capitalize">{item.condition}</td>
                      <td className="px-4 py-3">${Number(item.starting_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3">
                        {linkedAuction ? (
                          <span className={`badge text-xs ${AUCTION_STATUS_BADGES[linkedAuction.status] || 'badge-stone'}`}>
                            {linkedAuction.status}
                          </span>
                        ) : (
                          <span className="text-stone-300 text-xs">Sin subasta</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => openItemModal(item)} className="btn-secondary btn-sm">Editar</button>
                          {!linkedAuction && (
                            <button
                              onClick={() => openAuctionModal(item)}
                              className="btn-sm bg-stone-800 hover:bg-stone-900 text-white font-medium rounded px-3 py-1 text-xs"
                            >
                              Subastar
                            </button>
                          )}
                          {!linkedAuction && (
                            <button onClick={() => deleteItem(item.id)} className="btn-danger btn-sm">Eliminar</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {auctionItem && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 space-y-4">
                <div>
                  <h3 className="font-bold text-lg">Iniciar subasta</h3>
                  <p className="text-sm text-stone-500 mt-1">{auctionItem.title}</p>
                  <p className="text-xs text-stone-400">Precio inicial: ${Number(auctionItem.starting_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <label className="label">Inicio de subasta</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={auctionForm.start_time}
                    onChange={e => setAuctionForm({ ...auctionForm, start_time: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Fin de subasta</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={auctionForm.end_time}
                    onChange={e => setAuctionForm({ ...auctionForm, end_time: e.target.value })}
                  />
                </div>
                <div className="bg-stone-50 rounded-lg p-3 text-xs text-stone-500 space-y-1">
                  <p>• La subasta inicia en estado <strong>scheduled</strong> y cambia a <strong>active</strong> automáticamente</p>
                  <p>• Al cerrar, el ganador será cobrado desde su saldo retenido</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={saveAuction} className="btn-primary w-full">Crear subasta</button>
                  <button onClick={() => setAuctionItem(null)} className="btn-secondary w-full">Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {showItemModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                <h3 className="font-bold text-lg">{editingItem ? 'Editar producto' : 'Nuevo producto'}</h3>
                <div>
                  <label className="label">Título</label>
                  <input className="input" value={itemForm.title} onChange={e => setItemForm({ ...itemForm, title: e.target.value })} />
                </div>
                <div>
                  <label className="label">Descripción</label>
                  <textarea className="input" rows={3} value={itemForm.description} onChange={e => setItemForm({ ...itemForm, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Categoría</label>
                    <select className="input" value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value })}>
                      <option value="">Seleccionar…</option>
                      <option value="electronics">Electrónica</option>
                      <option value="clothing">Ropa</option>
                      <option value="toys">Juguetes</option>
                      <option value="art">Arte</option>
                      <option value="jewelry">Joyería</option>
                      <option value="collectibles">Coleccionables</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Condición</label>
                    <select className="input" value={itemForm.condition} onChange={e => setItemForm({ ...itemForm, condition: e.target.value })}>
                      <option value="new">Nuevo</option>
                      <option value="used">Usado</option>
                      <option value="refurbished">Reacondicionado</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Precio inicial</label>
                    <input type="number" step="0.01" className="input" value={itemForm.starting_price} onChange={e => setItemForm({ ...itemForm, starting_price: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Precio reserva</label>
                    <input type="number" step="0.01" className="input" value={itemForm.reserve_price} onChange={e => setItemForm({ ...itemForm, reserve_price: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Incremento mínimo</label>
                    <input type="number" step="0.01" className="input" value={itemForm.min_bid_increment} onChange={e => setItemForm({ ...itemForm, min_bid_increment: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="label">Imágenes <span className="text-stone-400 font-normal">(máx. 5)</span></label>
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    className="input py-2"
                    onChange={e => {
                      const files = Array.from(e.target.files)
                      if (files.length > 5) {
                        alert('Máximo 5 imágenes permitidas')
                        e.target.value = ''
                        return
                      }
                      setItemImages(files)
                    }}
                  />
                  {itemImages.length > 0 && (
                    <p className={`text-xs mt-1 ${itemImages.length > 5 ? 'text-red-500' : 'text-stone-400'}`}>
                      {itemImages.length}/5 imagen(es) seleccionada(s)
                    </p>
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={saveItem} className="btn-primary w-full">Guardar</button>
                  <button onClick={() => setShowItemModal(false)} className="btn-secondary w-full">Cancelar</button>
                </div>
              </div>
            </div>
          )}
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
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-stone-800">Cola de verificación KYC</h2>
            <span className="badge-amber">{queue.length} pendientes</span>
          </div>
          {queue.length === 0 ? (
            <div className="card py-16 flex flex-col items-center text-stone-400">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <p className="text-sm mt-3">No hay documentos pendientes de revisión</p>
            </div>
          ) : (
            <div className="space-y-4">
              {queue.map((doc) => (
                <KycDocCard key={doc.id} doc={doc} onReview={reviewDoc} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── KYC Document Card (Admin) ──────────────────────────────────────────── */
const DOC_TYPE_LABELS = {
  ine: 'INE',
  passport: 'Pasaporte',
  proof_address: 'Comprobante de domicilio',
}

function KycDocCard({ doc, onReview }) {
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [showNotes, setShowNotes] = useState(false)

  const isImage = /\.(jpe?g|png)$/i.test(doc.file_path)
  const isPdf = /\.pdf$/i.test(doc.file_path)
  const docUrl = `/uploads/${doc.file_path}`

  const handleAction = async (status) => {
    setLoading(true)
    await onReview(doc.id, status, notes)
    setLoading(false)
  }

  return (
    <div className="card p-5 space-y-4">
      {/* Header: user + doc type */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-stone-800">{doc.user_full_name || '—'}</p>
          <p className="text-xs text-stone-400">{doc.user_email}</p>
        </div>
        <span className="badge-amber shrink-0">{DOC_TYPE_LABELS[doc.type] || doc.type}</span>
      </div>

      {/* Document preview */}
      <div className="rounded-lg overflow-hidden border border-stone-200 bg-stone-50">
        {isImage ? (
          <a href={docUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={docUrl}
              alt={doc.type}
              className="w-full max-h-64 object-contain cursor-zoom-in"
              onError={e => { e.currentTarget.style.display = 'none' }}
            />
          </a>
        ) : isPdf ? (
          <a
            href={docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 hover:bg-stone-100 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-rose-500 shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span className="text-sm text-stone-700 font-medium">Ver PDF</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-stone-400 ml-auto">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        ) : (
          <a href={docUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-3 text-sm text-stone-600 hover:bg-stone-100">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Ver documento
          </a>
        )}
      </div>

      <p className="text-xs text-stone-400">
        Subido: {new Date(doc.uploaded_at).toLocaleString('es-MX')}
      </p>

      {/* Notes toggle */}
      {showNotes ? (
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Notas para el usuario (opcional)"
          className="input text-sm w-full resize-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="text-xs text-stone-400 hover:text-stone-600 underline"
        >
          + Agregar nota al rechazar
        </button>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          disabled={loading}
          onClick={() => handleAction('approved')}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg py-2 transition-colors disabled:opacity-40"
        >
          Aprobar
        </button>
        <button
          disabled={loading}
          onClick={() => handleAction('rejected')}
          className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-lg py-2 transition-colors disabled:opacity-40"
        >
          Rechazar
        </button>
      </div>
    </div>
  )
}

/* ─── Editable Shipment Row ──────────────────────────────────────────────── */
function ShipmentRow({ shipment, onUpdate }) {
  const [status, setStatus] = useState(shipment.status)
  const [tracking, setTracking] = useState(shipment.tracking_number || '')
  const [showAddr, setShowAddr] = useState(false)

  const handleSave = () => {
    onUpdate(shipment.id, { status, tracking_number: tracking })
  }

  const addr = shipment.address || shipment.winner?.shipping_address
  const addrText = addr
    ? [addr.street, addr.city, addr.state, addr.zip_code, addr.country].filter(Boolean).join(', ')
    : null

  return (
    <>
      <tr className="hover:bg-stone-50">
        <td className="px-4 py-3 font-medium">{shipment.auction?.item?.title || '—'}</td>
        <td className="px-4 py-3">
          {shipment.winner ? (
            <div>
              <p>{shipment.winner.full_name}</p>
              <p className="text-xs text-stone-400">{shipment.winner.email}</p>
              {shipment.winner.phone && <p className="text-xs text-stone-400">{shipment.winner.phone}</p>}
            </div>
          ) : '—'}
        </td>
        <td className="px-4 py-3 capitalize">{shipment.method}</td>
        <td className="px-4 py-3">
          <select className="input text-xs py-1" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="pending">Pendiente</option>
            <option value="processing">En proceso</option>
            <option value="shipped">Enviado</option>
            <option value="delivered">Entregado</option>
          </select>
        </td>
        <td className="px-4 py-3">
          <input className="input text-xs py-1 w-32" value={tracking} onChange={e => setTracking(e.target.value)} placeholder="Guía" />
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-2 items-center">
            <button onClick={handleSave} className="btn-primary btn-sm">Guardar</button>
            {addrText && (
              <button onClick={() => setShowAddr(!showAddr)} className="btn-secondary btn-sm text-xs" title="Ver dirección">
                📍
              </button>
            )}
          </div>
        </td>
      </tr>
      {showAddr && addr && (
        <tr className="bg-stone-50 border-t border-stone-100">
          <td colSpan={6} className="px-4 py-3">
            <div className="text-sm text-stone-700 space-y-1">
              <p className="font-medium text-stone-500 text-xs uppercase tracking-wide mb-2">Dirección de envío</p>
              <p><span className="text-stone-400 text-xs">Calle:</span> {addr.street}</p>
              <div className="flex gap-6">
                <p><span className="text-stone-400 text-xs">Ciudad:</span> {addr.city}</p>
                <p><span className="text-stone-400 text-xs">Estado:</span> {addr.state}</p>
                <p><span className="text-stone-400 text-xs">CP:</span> {addr.zip_code}</p>
                <p><span className="text-stone-400 text-xs">País:</span> {addr.country}</p>
              </div>
              {addr.references && <p><span className="text-stone-400 text-xs">Referencias:</span> {addr.references}</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
