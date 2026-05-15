import { useState, useEffect, useRef } from 'react'

// Simple in-memory cache para evitar repetir peticiones al mismo CP
const _cache = {}

/**
 * Consulta el catálogo SEPOMEX vía copomex API.
 * Retorna { estado, municipio, colonias[] } o null si no se encuentra.
 */
async function fetchCP(cp) {
  if (_cache[cp] !== undefined) return _cache[cp]

  try {
    const res = await fetch(
      `https://api.copomex.com/query/info_cp/${cp}?type=simplified&token=DEMO`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) { _cache[cp] = null; return null }
    const data = await res.json()
    if (data.error || !Array.isArray(data.response) || data.response.length === 0) {
      _cache[cp] = null
      return null
    }
    const items = data.response
    const result = {
      estado: items[0].estado || '',
      municipio: items[0].municipio || '',
      colonias: [...new Set(items.map(i => i.asentamiento).filter(Boolean))].sort(),
    }
    _cache[cp] = result
    return result
  } catch {
    // Red caída o timeout — no cachear para que reintente
    return null
  }
}

/**
 * Hook que recibe un CP (string) y devuelve los datos del catálogo SEPOMEX.
 *
 * Retorna:
 *   result   → { estado, municipio, colonias[] } | null
 *   loading  → boolean
 *   notFound → boolean (CP de 5 dígitos pero no está en el catálogo)
 */
export function useCP(cp) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const timerRef = useRef(null)
  const abortRef = useRef(false)

  useEffect(() => {
    clearTimeout(timerRef.current)
    abortRef.current = false

    const clean = (cp || '').replace(/\D/g, '')

    if (clean.length !== 5) {
      setResult(null)
      setNotFound(false)
      setLoading(false)
      return
    }

    setLoading(true)
    setNotFound(false)

    timerRef.current = setTimeout(async () => {
      const data = await fetchCP(clean)
      if (abortRef.current) return
      setResult(data)
      setNotFound(!data)
      setLoading(false)
    }, 400) // debounce 400 ms

    return () => {
      clearTimeout(timerRef.current)
      abortRef.current = true
    }
  }, [cp])

  return { result, loading, notFound }
}
