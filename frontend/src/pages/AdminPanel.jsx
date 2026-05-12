import { useEffect, useState } from 'react'
import api from '../services/api'

export default function AdminPanel() {
  const [stats, setStats] = useState(null)
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [s, q] = await Promise.all([
        api.get('/v1/admin/dashboard'),
        api.get('/v1/documents/admin/kyc-queue'),
      ])
      setStats(s.data)
      setQueue(q.data)
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

  if (loading) return <div className="p-8">Cargando...</div>

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Panel de Administración</h1>

      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-4 rounded shadow">
            <p className="text-sm text-gray-500">Usuarios</p>
            <p className="text-2xl font-bold">{stats.total_users}</p>
          </div>
          <div className="bg-white p-4 rounded shadow">
            <p className="text-sm text-gray-500">Subastas activas</p>
            <p className="text-2xl font-bold">{stats.active_auctions}</p>
          </div>
          <div className="bg-white p-4 rounded shadow">
            <p className="text-sm text-gray-500">KYC pendiente</p>
            <p className="text-2xl font-bold">{stats.pending_kyc}</p>
          </div>
        </div>
      )}

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
    </div>
  )
}
