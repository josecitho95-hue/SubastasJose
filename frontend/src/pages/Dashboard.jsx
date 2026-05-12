import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import KycUploader from '../components/KycUploader'

const KYC_LABELS = { pending: 'Pendiente', approved: 'Verificado', rejected: 'Rechazado' }
const KYC_BADGE = { pending: 'badge-amber', approved: 'badge-green', rejected: 'badge-red' }

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [wallet, setWallet] = useState(null)
  const [dashData, setDashData] = useState({})

  useEffect(() => {
    api.get('/v1/users/me').then(r => setUser(r.data)).catch(() => {})
    api.get('/v1/payments/wallet').then(r => setWallet(r.data)).catch(() => {})
    api.get('/v1/users/me/dashboard').then(r => setDashData(r.data || {})).catch(() => {})
  }, [])

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
          <div className="w-11 h-11 rounded-full bg-stone-800 flex items-center justify-center text-white font-semibold text-sm shrink-0">
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
              <Link to="/deposit" className="btn-secondary btn-sm mt-4 inline-flex">
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

      {/* ── Active bids ──────────────────────────────────────────────────────── */}
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

      {/* ── Auctions won ─────────────────────────────────────────────────────── */}
      {wonAuctions.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-stone-100">
            <h2 className="font-semibold text-stone-800">Subastas ganadas</h2>
          </div>
          <div className="divide-y divide-stone-100">
            {wonAuctions.map(a => (
              <div key={a.id} className="px-5 py-3 flex items-center justify-between hover:bg-stone-50 transition-colors">
                <Link to={`/auction/${a.id}/shipping`} className="text-sm font-medium text-stone-800 hover:underline">
                  Subasta {a.id?.slice(0, 8)}…
                </Link>
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-stone-900">
                    ${Number(a.final_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </p>
                  <Link to={`/auction/${a.id}/shipping`} className="btn-secondary btn-sm">
                    Envío
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

