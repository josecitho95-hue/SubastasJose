import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuctionWebSocket } from '../services/websocket'
import api from '../services/api'
import { Decimal } from 'decimal.js'

/* ─── Countdown timer ────────────────────────────────────────────────────── */
function Countdown({ endTime }) {
  const calc = () => {
    const diff = Math.max(0, new Date(endTime) - Date.now())
    return {
      h: Math.floor(diff / 3600000),
      m: Math.floor((diff % 3600000) / 60000),
      s: Math.floor((diff % 60000) / 1000),
      done: diff === 0,
    }
  }
  const [t, setT] = useState(calc)
  useEffect(() => {
    const id = setInterval(() => setT(calc()), 1000)
    return () => clearInterval(id)
  }, [endTime])

  const pad = n => String(n).padStart(2, '0')
  if (t.done) return <span className="badge-red">Subasta cerrada</span>

  const urgent = t.h === 0 && t.m < 5
  return (
    <div className={`flex items-end gap-1 font-mono tabular-nums ${urgent ? 'text-rose-600' : 'text-stone-800'}`}>
      <div className="text-center">
        <span className="text-3xl font-bold">{pad(t.h)}</span>
        <p className="text-xs text-stone-400 font-sans">h</p>
      </div>
      <span className="text-2xl font-bold pb-4 text-stone-300">:</span>
      <div className="text-center">
        <span className="text-3xl font-bold">{pad(t.m)}</span>
        <p className="text-xs text-stone-400 font-sans">min</p>
      </div>
      <span className="text-2xl font-bold pb-4 text-stone-300">:</span>
      <div className="text-center">
        <span className="text-3xl font-bold">{pad(t.s)}</span>
        <p className="text-xs text-stone-400 font-sans">seg</p>
      </div>
    </div>
  )
}

/* ─── Activity feed item ─────────────────────────────────────────────────── */
function FeedItem({ msg }) {
  if (msg.type === 'price_update') return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
      <span className="text-stone-600">Nueva puja:</span>
      <span className="font-semibold text-stone-800">
        ${Number(msg.current_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
      </span>
    </div>
  )
  if (msg.type === 'ack') return (
    <div className={`flex items-center gap-2 py-1.5 text-sm ${msg.status === 'accepted' ? 'text-emerald-700' : 'text-rose-600'}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${msg.status === 'accepted' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
      {msg.status === 'accepted' ? 'Tu puja fue aceptada' : `Rechazada: ${msg.reason}`}
    </div>
  )
  if (msg.type === 'snapshot') return (
    <div className="flex items-center gap-2 py-1.5 text-sm text-stone-400">
      <span className="w-1.5 h-1.5 rounded-full bg-stone-300 shrink-0" />
      Conectado a la subasta
    </div>
  )
  return null
}

/* ─── Image Gallery ──────────────────────────────────────────────────────── */
function ImageGallery({ images, title }) {
  const [selected, setSelected] = useState(0)
  if (!images || images.length === 0) {
    return (
      <div className="h-72 sm:h-96 bg-stone-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-stone-300">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="m21 15-5-5L5 21"/>
          </svg>
          <span className="text-sm">Sin imagen disponible</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="h-72 sm:h-96 bg-stone-100 overflow-hidden rounded-lg">
        <img
          src={`/uploads/${images[selected]}`}
          alt={`${title} - ${selected + 1}`}
          className="h-full w-full object-cover transition-opacity duration-300"
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => setSelected(idx)}
              className={`w-16 h-16 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-colors ${
                idx === selected ? 'border-stone-800' : 'border-transparent hover:border-stone-300'
              }`}
            >
              <img src={`/uploads/${img}`} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Bid History ────────────────────────────────────────────────────────── */
function BidHistory({ auctionId }) {
  const [bids, setBids] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/v1/auctions/${auctionId}/bids?limit=20`)
      .then(res => { setBids(res.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [auctionId])

  if (loading) return <p className="text-sm text-stone-400 py-4 text-center">Cargando historial…</p>
  if (bids.length === 0) return <p className="text-sm text-stone-400 py-4 text-center">Sin pujas aún</p>

  return (
    <div className="divide-y divide-stone-100 max-h-64 overflow-y-auto">
      {bids.map(b => (
        <div key={b.id} className="py-2 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.is_winning ? 'bg-emerald-500' : 'bg-stone-300'}`} />
            <span className="text-stone-500">{new Date(b.placed_at).toLocaleString('es-MX')}</span>
          </div>
          <span className={`font-semibold ${b.is_winning ? 'text-emerald-700' : 'text-stone-700'}`}>
            ${Number(b.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ─── Main page ──────────────────────────────────────────────────────────── */
export default function AuctionDetail() {
  const { id } = useParams()
  const [auction, setAuction] = useState(null)
  const [bidAmount, setBidAmount] = useState('')
  const [error, setError] = useState('')
  const [priceFlash, setPriceFlash] = useState(false)
  const feedRef = useRef(null)
  const { connected, price, endTime, leaderId, messages, placeBid } = useAuctionWebSocket(id)

  useEffect(() => {
    api.get(`/v1/auctions/${id}`)
      .then(res => { setAuction(res.data); setBidAmount(res.data.current_price) })
      .catch(() => setError('No se pudo cargar la subasta'))
  }, [id])

  // Flash price on update
  const prevPrice = useRef(null)
  useEffect(() => {
    if (price && price !== prevPrice.current) {
      prevPrice.current = price
      setPriceFlash(true)
      const t = setTimeout(() => setPriceFlash(false), 1200)
      return () => clearTimeout(t)
    }
  }, [price])

  // Scroll activity feed
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [messages])

  const handleBid = () => {
    if (!bidAmount) return
    try {
      const amt = new Decimal(bidAmount)
      placeBid(amt.toFixed(2))
      setError('')
    } catch {
      setError('Monto inválido')
    }
  }

  const currentPrice = price || auction?.current_price
  const displayEndTime = endTime || auction?.end_time
  const minIncrement = auction?.item?.min_bid_increment || '1.00'
  const reserveMet = auction?.item?.reserve_price ? currentPrice >= auction.item.reserve_price : true

  if (!auction) return (
    <div className="section flex flex-col items-center justify-center py-24 text-stone-400">
      <svg className="animate-spin h-8 w-8 mb-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 00-10 10h4z"/>
      </svg>
      <p className="text-sm">Cargando subasta…</p>
    </div>
  )

  return (
    <div className="section">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: Item info ─────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5 fade-up">
          {/* Image Gallery */}
          <div className="card overflow-hidden p-3">
            <ImageGallery images={auction.item?.images} title={auction.item?.title} />
          </div>

          {/* Item details */}
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <span className="badge-stone capitalize mb-2 inline-block">{auction.item?.category || 'General'}</span>
                <h1 className="text-xl font-bold text-stone-900">{auction.item?.title}</h1>
              </div>
              <span className={`badge shrink-0 ${connected ? 'badge-green' : 'badge-stone'}`}>
                {connected ? <><span className="dot-live mr-1" />En vivo</> : 'Desconectado'}
              </span>
            </div>
            <p className="text-stone-500 text-sm leading-relaxed">{auction.item?.description}</p>

            <div className="divider" />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-stone-400 text-xs mb-0.5">Precio inicial</p>
                <p className="font-medium text-stone-700">${Number(auction.item?.starting_price || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-stone-400 text-xs mb-0.5">Precio de reserva</p>
                <p className="font-medium text-stone-700">
                  {auction.item?.reserve_price ? (
                    <span className={reserveMet ? 'text-emerald-700' : 'text-amber-700'}>
                      ${Number(auction.item.reserve_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      {reserveMet ? ' (Alcanzado)' : ' (Pendiente)'}
                    </span>
                  ) : 'Sin reserva'}
                </p>
              </div>
              <div>
                <p className="text-stone-400 text-xs mb-0.5">Condición</p>
                <p className="font-medium capitalize text-stone-700">{auction.item?.condition || '—'}</p>
              </div>
              <div>
                <p className="text-stone-400 text-xs mb-0.5">Incremento mínimo</p>
                <p className="font-medium text-stone-700">${minIncrement}</p>
              </div>
            </div>

            <div className="divider" />

            <div className="text-sm">
              <p className="text-stone-400 text-xs mb-0.5">Vendedor</p>
              <p className="font-medium text-stone-700">Subastas Oficial</p>
            </div>
          </div>

          {/* Activity feed */}
          <div className="card p-5">
            <h3 className="font-semibold text-stone-800 mb-3 flex items-center gap-2">
              <span className="dot-live" /> Actividad en tiempo real
            </h3>
            <div ref={feedRef} className="h-36 overflow-y-auto divide-y divide-stone-100">
              {messages.length === 0
                ? <p className="text-stone-400 text-sm py-4 text-center">Esperando actividad…</p>
                : messages.map((m, i) => <FeedItem key={i} msg={m} />)
              }
            </div>
          </div>

          {/* Bid History */}
          <div className="card p-5">
            <h3 className="font-semibold text-stone-800 mb-3">Historial de pujas</h3>
            <BidHistory auctionId={id} />
          </div>
        </div>

        {/* ── Right: Bid panel ────────────────────────────────────────────── */}
        <div className="lg:col-span-1 fade-up stagger-2">
          <div className="card p-6 lg:sticky lg:top-20 space-y-6">
            {/* Countdown */}
            <div>
              <p className="text-xs text-stone-400 mb-2 uppercase tracking-wide font-medium">Termina en</p>
              {displayEndTime && <Countdown endTime={displayEndTime} />}
            </div>

            <div className="divider" />

            {/* Current price */}
            <div className={`rounded-lg p-4 bg-stone-50 border border-stone-200 transition-colors ${priceFlash ? 'price-flash' : ''}`}>
              <p className="text-xs text-stone-400 mb-1">Puja actual</p>
              <p className="text-3xl font-bold text-stone-900 tracking-tight">
                ${currentPrice ? Number(currentPrice).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'}
              </p>
            </div>

            {/* Bid input */}
            <div>
              <label className="label">Tu puja <span className="text-stone-400 font-normal normal-case">(mín. +${minIncrement})</span></label>
              <input
                type="number"
                step="0.01"
                min={Number(currentPrice || 0) + Number(minIncrement)}
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                className="input text-lg font-semibold"
                placeholder="0.00"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
                {error}
              </div>
            )}

            <button
              onClick={handleBid}
              disabled={!connected}
              className="btn-primary btn-lg w-full"
            >
              {connected ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                  Realizar puja
                </>
              ) : 'Conectando…'}
            </button>

            <p className="text-center text-xs text-stone-400">
              Tu saldo es retenido al pujar y liberado si eres superado.
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
