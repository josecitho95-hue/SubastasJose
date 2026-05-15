import { useEffect, useRef, useState } from 'react'
import api from '../services/api'

const DOC_SLOTS = [
  {
    key: 'identity',
    label: 'Identificación oficial',
    hint: 'INE (anverso y reverso) o Pasaporte',
    types: ['ine', 'passport'],
    typeLabels: { ine: 'INE', passport: 'Pasaporte' },
  },
  {
    key: 'address',
    label: 'Comprobante de domicilio',
    hint: 'Recibo de luz, agua, teléfono o estado de cuenta (no mayor a 3 meses)',
    types: ['proof_address'],
    typeLabels: { proof_address: 'Comprobante de domicilio' },
  },
]

const STATUS_STYLES = {
  pending:  { badge: 'badge-amber', label: 'En revisión' },
  approved: { badge: 'badge-green', label: 'Aprobado' },
  rejected: { badge: 'badge-red',   label: 'Rechazado' },
}

function DocSlot({ slot, existingDocs, onUploaded }) {
  const [docType, setDocType] = useState(slot.types[0])
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  // Find the most recent doc for this slot's accepted types
  const existing = existingDocs
    .filter(d => slot.types.includes(d.type))
    .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))[0]

  const st = existing ? (STATUS_STYLES[existing.status] || { badge: 'badge-stone', label: existing.status }) : null

  const handleUpload = async () => {
    if (!file) return
    setError('')
    setLoading(true)
    const formData = new FormData()
    formData.append('type', docType)
    formData.append('file', file)
    try {
      // Do NOT set Content-Type — browser must set it with the multipart boundary
      await api.post('/v1/users/me/documents', formData)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      onUploaded()
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al subir el archivo')
    }
    setLoading(false)
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-stone-800">{slot.label}</p>
          <p className="text-xs text-stone-400 mt-0.5">{slot.hint}</p>
        </div>
        {st && <span className={`${st.badge} shrink-0`}>{st.label}</span>}
      </div>

      {/* Existing doc info */}
      {existing && (
        <div className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600 space-y-0.5">
          <p className="font-medium">{slot.typeLabels[existing.type] || existing.type}</p>
          <p className="text-stone-400">
            Subido el {new Date(existing.uploaded_at).toLocaleDateString('es-MX')}
          </p>
          {existing.review_notes && (
            <p className="text-rose-600 mt-1">Nota: {existing.review_notes}</p>
          )}
        </div>
      )}

      {/* Upload form — only show if not yet approved */}
      {(!existing || existing.status !== 'approved') && (
        <div className="space-y-2">
          {slot.types.length > 1 && (
            <div className="flex gap-2">
              {slot.types.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDocType(t)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    docType === t
                      ? 'border-stone-700 bg-stone-800 text-white'
                      : 'border-stone-200 text-stone-500 hover:border-stone-400'
                  }`}
                >
                  {slot.typeLabels[t]}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="flex-1 flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-stone-300 px-3 py-2 hover:border-stone-400 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-stone-400 shrink-0">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span className="text-xs text-stone-500 truncate">
                {file ? file.name : 'JPG, PNG o PDF — máx 5 MB'}
              </span>
              <input
                ref={inputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
                onChange={e => setFile(e.target.files[0] || null)}
              />
            </label>
            <button
              type="button"
              disabled={!file || loading}
              onClick={handleUpload}
              className="btn-primary btn-sm shrink-0 disabled:opacity-40"
            >
              {loading ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 00-10 10h4z"/>
                </svg>
              ) : 'Subir'}
            </button>
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  )
}

export default function KycUploader() {
  const [docs, setDocs] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(true)

  const loadDocs = () => {
    setLoadingDocs(true)
    api.get('/v1/users/me/documents')
      .then(r => setDocs(r.data || []))
      .catch(() => {})
      .finally(() => setLoadingDocs(false))
  }

  useEffect(() => { loadDocs() }, [])

  if (loadingDocs) {
    return (
      <div className="flex items-center gap-2 text-stone-400 text-sm py-2">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 00-10 10h4z"/>
        </svg>
        Cargando documentos…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {DOC_SLOTS.map(slot => (
        <DocSlot
          key={slot.key}
          slot={slot}
          existingDocs={docs}
          onUploaded={loadDocs}
        />
      ))}
    </div>
  )
}
