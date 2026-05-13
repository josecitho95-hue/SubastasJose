import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Decimal } from 'decimal.js'
import api from '../services/api'

/* ─── Countdown hook ─────────────────────────────────────────────────────── */
function useCountdown(endTime) {
  const calc = () => {
    const diff = Math.max(0, new Date(endTime) - Date.now())
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    const s = Math.floor((diff % 60000) / 1000)
    return { h, m, s, done: diff === 0 }
  }
  const [time, setTime] = useState(calc)
  useEffect(() => {
    const id = setInterval(() => setTime(calc()), 1000)
    return () => clearInterval(id)
  }, [endTime])
  return time
}

/* ─── Auction card ───────────────────────────────────────────────────────── */
function AuctionCard({ a, index }) {
  const { h, m, s, done } = useCountdown(a.end_time)
  const pad = n => String(n).padStart(2, '0')

  return (
    <Link
      to={`/auction/${a.id}`}
      className="card card-hover group block overflow-hidden fade-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Image */}
      <div className="relative h-48 bg-stone-100 overflow-hidden">
        {a.image_thumb ? (
          <img
            src={`/uploads/${a.image_thumb}`}
            alt={a.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-stone-300">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="3"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="m21 15-5-5L5 21"/>
            </svg>
            <span className="text-xs">Sin imagen</span>
          </div>
        )}
        {/* Category pill */}
        <span className="absolute top-3 left-3 badge-stone capitalize">{a.category || 'General'}</span>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-stone-800 leading-snug line-clamp-1 mb-1">{a.title}</h3>

        <div className="flex items-end justify-between mt-3">
          <div>
            <p className="text-xs text-stone-400 mb-0.5">Puja actual</p>
            <p className="text-lg font-bold text-stone-900 tracking-tight">
              ${new Decimal(a.current_price).toNumber().toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </div>

          {/* Countdown */}
          <div className="text-right">
            <p className="text-xs text-stone-400 mb-0.5">Termina en</p>
            {done ? (
              <span className="badge-red text-xs">Cerrada</span>
            ) : (
              <span className="font-mono text-sm font-semibold text-stone-700">
                {pad(h)}:{pad(m)}:{pad(s)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

/* ─── Skeleton card ──────────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton h-48" />
      <div className="p-4 space-y-3">
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-3 w-1/2" />
        <div className="flex justify-between mt-2">
          <div className="skeleton h-6 w-24" />
          <div className="skeleton h-6 w-20" />
        </div>
      </div>
    </div>
  )
}

/* ─── Stats bar ──────────────────────────────────────────────────────────── */
function StatItem({ value, label }) {
  return (
    <div className="text-center px-6">
      <p className="text-2xl font-bold text-stone-900 tracking-tight">{value}</p>
      <p className="text-xs text-stone-500 mt-0.5">{label}</p>
    </div>
  )
}

/* ─── Categories ─────────────────────────────────────────────────────────── */
const CATEGORIES = ['Todos', 'Arte', 'Joyería', 'Electrónica', 'Coleccionables', 'Ropa', 'Otros']

/* ─── Home page ──────────────────────────────────────────────────────────── */
export default function Home() {
  const [auctions, setAuctions] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('Todos')
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get('/v1/auctions?limit=12')
      .then(res => { setAuctions(res.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = auctions.filter(a => {
    const matchCategory = category === 'Todos' || (a.category || '').toLowerCase() === category.toLowerCase()
    const q = search.toLowerCase()
    const matchSearch = !q || (a.title || '').toLowerCase().includes(q) || (a.category || '').toLowerCase().includes(q)
    return matchCategory && matchSearch
  })

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="max-w-2xl fade-up">
            <span className="badge-stone mb-4 inline-flex">
              <span className="dot-live mr-1.5" />
              Plataforma en vivo
            </span>
            <h1 className="text-4xl sm:text-5xl font-bold text-stone-900 leading-tight tracking-tight mt-3">
              Descubre subastas<br />
              <span className="text-stone-500 font-light">únicas y exclusivas</span>
            </h1>
            <p className="mt-5 text-stone-500 text-base sm:text-lg leading-relaxed max-w-xl">
              Participa en tiempo real. Pujas atómicas, resultados inmediatos
              y tu dinero protegido hasta que ganes.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <a href="#subastas" className="btn-primary btn-lg">
                Ver subastas
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </a>
              <Link to="/register" className="btn-secondary btn-lg">
                Crear cuenta
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <section className="bg-stone-50 border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 fade-up stagger-1">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-y-4 divide-x divide-stone-200">
            <StatItem value={auctions.length || '—'} label="Subastas activas" />
            <StatItem value="100%" label="Pagos seguros" />
            <StatItem value="< 50ms" label="Latencia de puja" />
            <StatItem value="24/7" label="Disponibilidad" />
          </div>
        </div>
      </section>

      {/* ── Auctions grid ────────────────────────────────────────────────── */}
      <section id="subastas" className="section">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-xl font-semibold text-stone-900">Subastas activas</h2>
            <p className="text-sm text-stone-500 mt-0.5">
              {loading ? 'Cargando…' : `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.3-4.3"/>
              </svg>
              <input
                type="text"
                placeholder="Buscar subastas…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input pl-9 text-sm w-48 sm:w-64"
              />
            </div>

            {/* Category filter */}
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`btn btn-sm rounded-full border transition-all ${
                  category === cat
                    ? 'bg-stone-800 text-white border-stone-800'
                    : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-stone-400">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M9.5 2h5l1.5 3H8L9.5 2zM3 8h18l-2 13H5L3 8z"/>
              <path d="M10 12v5M14 12v5"/>
            </svg>
            <p className="mt-4 font-medium text-stone-500">No hay subastas en esta categoría</p>
            <button onClick={() => setCategory('Todos')} className="btn-ghost btn-sm mt-3">
              Ver todas
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((a, i) => <AuctionCard key={a.id} a={a} index={i} />)}
          </div>
        )}
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────────────── */}
      {!loading && (
        <section className="bg-stone-900 mt-6 fade-up stagger-3">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-xl font-semibold text-white">¿Listo para participar?</h3>
              <p className="text-stone-400 mt-1 text-sm">Crea tu cuenta gratis y empieza a pujar hoy.</p>
            </div>
            <Link to="/register" className="btn btn-md bg-white text-stone-900 hover:bg-stone-100 shrink-0">
              Comenzar gratis
            </Link>
          </div>
        </section>
      )}
    </>
  )
}

