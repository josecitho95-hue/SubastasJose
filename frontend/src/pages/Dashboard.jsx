import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import KycUploader from '../components/KycUploader'

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [wallet, setWallet] = useState(null)
  const [bids, setBids] = useState([])

  useEffect(() => {
    api.get('/v1/users/me').then((res) => setUser(res.data))
    api.get('/v1/payments/wallet').then((res) => setWallet(res.data)).catch(() => {})
    api.get('/v1/users/me/dashboard').then((res) => setBids(res.data?.bids || [])).catch(() => {})
  }, [])

  if (!user) return <div className="p-8 text-center">Cargando...</div>

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Mi Cuenta</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="font-semibold mb-4">Perfil</h2>
          <p><strong>Nombre:</strong> {user.full_name}</p>
          <p><strong>Email:</strong> {user.email}</p>
          <p><strong>Teléfono:</strong> {user.phone || 'N/A'}</p>
          <p><strong>KYC:</strong> <span className={user.kyc_status === 'approved' ? 'text-green-600' : 'text-yellow-600'}>{user.kyc_status}</span></p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="font-semibold mb-4">Billetera</h2>
          {wallet ? (
            <>
              <p className="text-2xl font-bold text-indigo-600">${wallet.balance}</p>
              <p className="text-sm text-gray-500">Retenido: ${wallet.held_balance}</p>
              <Link to="/deposit" className="inline-block mt-4 bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700">
                Depositar
              </Link>
            </>
          ) : (
            <p className="text-gray-500">Sin billetera</p>
          )}
        </div>
      </div>

      {user.kyc_status !== 'approved' && (
        <div className="mb-8">
          <KycUploader />
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="font-semibold mb-4">Mis Pujas</h2>
        {bids.length === 0 ? (
          <p className="text-gray-500">No has realizado pujas aún.</p>
        ) : (
          <div className="space-y-2">
            {bids.map((b) => (
              <div key={b.id} className="flex justify-between border-b py-2">
                <span>Subasta {b.auction_id}</span>
                <span className="font-semibold">${b.amount}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
