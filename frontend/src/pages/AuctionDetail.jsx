import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuctionWebSocket } from '../services/websocket'
import api from '../services/api'
import { Decimal } from 'decimal.js'

export default function AuctionDetail() {
  const { id } = useParams()
  const [auction, setAuction] = useState(null)
  const [bidAmount, setBidAmount] = useState('')
  const [error, setError] = useState('')
  const { connected, price, endTime, leaderId, messages, placeBid } = useAuctionWebSocket(id)

  useEffect(() => {
    api.get(`/v1/auctions/${id}`).then((res) => {
      setAuction(res.data)
      setBidAmount(res.data.current_price)
    }).catch(() => setError('No se pudo cargar la subasta'))
  }, [id])

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

  if (!auction) return <div className="p-8 text-center">Cargando...</div>

  const currentPrice = price || auction.current_price
  const displayEndTime = endTime || auction.end_time
  const minIncrement = auction.item?.min_bid_increment || '1.00'

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">{auction.item?.title}</h1>
          <span className={`px-3 py-1 rounded text-sm ${connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {connected ? 'En vivo' : 'Desconectado'}
          </span>
        </div>

        <p className="text-gray-600 mb-4">{auction.item?.description}</p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 p-4 rounded">
            <p className="text-sm text-gray-500">Precio actual</p>
            <p className="text-2xl font-bold text-indigo-600">${currentPrice}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded">
            <p className="text-sm text-gray-500">Termina</p>
            <p className="text-lg font-semibold">{new Date(displayEndTime).toLocaleString()}</p>
          </div>
        </div>

        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">Tu puja (mínimo +${minIncrement})</label>
            <input
              type="number"
              step="0.01"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <button
            onClick={handleBid}
            disabled={!connected}
            className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            Pujar
          </button>
        </div>

        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

        <div className="mt-6">
          <h3 className="font-semibold mb-2">Actividad reciente</h3>
          <div className="bg-gray-50 rounded p-3 h-40 overflow-y-auto text-sm space-y-1">
            {messages.length === 0 && <span className="text-gray-400">Esperando actividad...</span>}
            {messages.map((m, i) => (
              <div key={i} className="text-gray-700">
                {m.type === 'price_update' && (
                  <span>Nueva puja: <strong>${m.current_price}</strong></span>
                )}
                {m.type === 'ack' && (
                  <span className={m.status === 'accepted' ? 'text-green-600' : 'text-red-600'}>
                    {m.status === 'accepted' ? 'Puja aceptada' : `Rechazada: ${m.reason}`}
                  </span>
                )}
                {m.type === 'snapshot' && (
                  <span className="text-gray-400">Conectado a la subasta</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
