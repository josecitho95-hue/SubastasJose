import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'

export default function Home() {
  const [auctions, setAuctions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/v1/auctions').then((res) => {
      setAuctions(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center">Cargando subastas...</div>

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Subastas Activas</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {auctions.map((a) => (
          <Link
            key={a.id}
            to={`/auction/${a.id}`}
            className="bg-white rounded-lg shadow hover:shadow-lg transition overflow-hidden"
          >
            <div className="h-48 bg-gray-200 flex items-center justify-center">
              {a.image_thumb ? (
                <img src={`/uploads/${a.image_thumb}`} alt={a.title} className="h-full w-full object-cover" />
              ) : (
                <span className="text-gray-400">Sin imagen</span>
              )}
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-lg">{a.title}</h3>
              <p className="text-gray-500 text-sm capitalize">{a.category}</p>
              <p className="text-indigo-600 font-bold mt-2">${a.current_price}</p>
              <p className="text-gray-400 text-xs mt-1">
                Termina: {new Date(a.end_time).toLocaleString()}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
