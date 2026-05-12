import { useState } from 'react'
import api from '../services/api'

export default function KycUploader() {
  const [type, setType] = useState('ine')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return

    setLoading(true)
    const formData = new FormData()
    formData.append('type', type)
    formData.append('file', file)

    try {
      await api.post('/v1/documents/me/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setMessage('Documento enviado correctamente. Espera la revisión.')
      setFile(null)
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Error al subir')
    }
    setLoading(false)
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="font-semibold mb-4">Verificación de identidad (KYC)</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Tipo de documento</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full border rounded px-3 py-2">
            <option value="ine">INE</option>
            <option value="passport">Pasaporte</option>
            <option value="proof_address">Comprobante de domicilio</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Archivo (JPG/PNG/PDF, máx 5MB)</label>
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            onChange={(e) => setFile(e.target.files[0])}
            className="w-full"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !file}
          className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Subiendo...' : 'Enviar documento'}
        </button>
      </form>
      {message && <p className="mt-4 text-sm text-gray-700">{message}</p>}
    </div>
  )
}
