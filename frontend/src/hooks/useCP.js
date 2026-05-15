import { useState, useEffect, useRef } from 'react'

// Singleton: el catálogo se carga una sola vez y se comparte entre todos los componentes
let _catalog = null
let _promise = null

function loadCatalog() {
  if (_catalog) return Promise.resolve(_catalog)
  if (!_promise) {
    _promise = fetch('/cp_catalog.json')
      .then(r => { if (!r.ok) throw new Error('No se pudo cargar el catálogo de CPs'); return r.json() })
      .then(data => { _catalog = data; return data })
      .catch(err => { _promise = null; throw err })
  }
  return _promise
}

/**
 * Hook que recibe un CP (string) y devuelve los datos del catálogo SEPOMEX.
 *
 * Retorna:
 *   result  → { estado, municipio, colonias[] } | null
 *   loading → boolean
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
      try {
        const data = await loadCatalog()
        if (abortRef.current) return
        const entry = data[clean] || null
        setResult(entry)
        setNotFound(!entry)
      } catch {
        if (!abortRef.current) setNotFound(true)
      } finally {
        if (!abortRef.current) setLoading(false)
      }
    }, 350)

    return () => {
      clearTimeout(timerRef.current)
      abortRef.current = true
    }
  }, [cp])

  return { result, loading, notFound }
}
