import { useEffect, useState } from 'react'
import { useCP } from '../hooks/useCP'

/**
 * Formulario de dirección mexicana con autocompletado por CP.
 *
 * Props:
 *   value    → objeto { street, colonia, municipio, estado, zip_code, country, references }
 *   onChange → función(newValue) llamada en cada cambio
 *   required → boolean (por defecto false — todos los campos son opcionales)
 *   disabled → boolean
 */
export default function AddressForm({ value = {}, onChange, required = false, disabled = false }) {
  const [zip, setZip] = useState(value.zip_code || '')
  const { result: cpData, loading: cpLoading, notFound: cpNotFound } = useCP(zip)

  // Cuando el CP resuelve, autocompleta estado y municipio
  useEffect(() => {
    if (!cpData) return
    onChange({
      ...value,
      zip_code: zip,
      estado: cpData.estado,
      municipio: cpData.municipio,
      // Limpia la colonia si las opciones cambiaron
      colonia: cpData.colonias.includes(value.colonia) ? value.colonia : '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpData])

  const set = (field, val) => onChange({ ...value, [field]: val })

  const handleZip = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 5)
    setZip(raw)
    if (raw.length !== 5) {
      // Limpia campos dependientes mientras escribe
      onChange({ ...value, zip_code: raw, estado: '', municipio: '', colonia: '' })
    } else {
      onChange({ ...value, zip_code: raw })
    }
  }

  const colonias = cpData?.colonias || []
  const hasLookup = zip.length === 5

  return (
    <div className="space-y-3">
      {/* CP + estado + municipio (una fila) */}
      <div className="grid grid-cols-5 gap-3 items-start">
        {/* CP */}
        <div className="col-span-2">
          <label className="label">
            Código postal{required && <span className="text-rose-500 ml-0.5">*</span>}
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              maxLength={5}
              value={zip}
              onChange={handleZip}
              placeholder="00000"
              required={required}
              disabled={disabled}
              className={`input pr-8 ${cpNotFound && hasLookup ? 'border-amber-400 focus:ring-amber-300' : ''}`}
            />
            {cpLoading && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2">
                <svg className="animate-spin w-4 h-4 text-stone-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 00-10 10h4z"/>
                </svg>
              </span>
            )}
            {!cpLoading && cpData && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-500">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </span>
            )}
          </div>
          {cpNotFound && hasLookup && (
            <p className="text-xs text-amber-600 mt-1">CP no encontrado. Verifica o captura manualmente.</p>
          )}
        </div>

        {/* Estado */}
        <div className="col-span-3">
          <label className="label">Estado</label>
          <input
            type="text"
            value={value.estado || ''}
            onChange={e => set('estado', e.target.value)}
            placeholder={cpLoading ? 'Buscando…' : 'Se llena con el CP'}
            required={required}
            disabled={disabled}
            className="input bg-stone-50"
          />
        </div>
      </div>

      {/* Municipio / Alcaldía */}
      <div>
        <label className="label">Municipio / Alcaldía</label>
        <input
          type="text"
          value={value.municipio || ''}
          onChange={e => set('municipio', e.target.value)}
          placeholder={cpLoading ? 'Buscando…' : 'Se llena con el CP'}
          required={required}
          disabled={disabled}
          className="input bg-stone-50"
        />
      </div>

      {/* Colonia */}
      <div>
        <label className="label">
          Colonia / Asentamiento{required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
        {colonias.length > 0 ? (
          <select
            value={value.colonia || ''}
            onChange={e => set('colonia', e.target.value)}
            required={required}
            disabled={disabled}
            className="input"
          >
            <option value="">— Selecciona tu colonia —</option>
            {colonias.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value="__otra__">Otra (capturar manualmente)</option>
          </select>
        ) : (
          <input
            type="text"
            value={value.colonia || ''}
            onChange={e => set('colonia', e.target.value)}
            placeholder="Nombre de tu colonia o asentamiento"
            required={required}
            disabled={disabled}
            className="input"
          />
        )}
        {/* Si el usuario eligió "Otra", muestra campo libre */}
        {value.colonia === '__otra__' && (
          <input
            type="text"
            value={value.colonia_custom || ''}
            onChange={e => onChange({ ...value, colonia: '__otra__', colonia_custom: e.target.value })}
            placeholder="Escribe el nombre de tu colonia"
            required={required}
            className="input mt-2"
          />
        )}
      </div>

      {/* Calle y número */}
      <div>
        <label className="label">
          Calle, número exterior e interior{required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
        <input
          type="text"
          value={value.street || ''}
          onChange={e => set('street', e.target.value)}
          placeholder="Ej. Av. Insurgentes Sur 1234, Int. 5"
          required={required}
          disabled={disabled}
          className="input"
        />
      </div>

      {/* Referencias */}
      <div>
        <label className="label">
          Referencias <span className="text-stone-400 font-normal">(opcional)</span>
        </label>
        <input
          type="text"
          value={value.references || ''}
          onChange={e => set('references', e.target.value)}
          placeholder="Ej. Entre calles Morelos y Juárez, fachada azul"
          disabled={disabled}
          className="input"
        />
      </div>
    </div>
  )
}

/**
 * Convierte el valor del formulario al formato que espera el backend.
 * Resuelve el campo especial 'colonia_custom' cuando el usuario eligió "Otra".
 */
export function serializeAddress(value) {
  if (!value) return null
  const colonia = value.colonia === '__otra__' ? (value.colonia_custom || '') : (value.colonia || '')
  return {
    street: value.street || '',
    colonia,
    municipio: value.municipio || '',
    estado: value.estado || '',
    zip_code: value.zip_code || '',
    country: value.country || 'México',
    references: value.references || undefined,
  }
}

/**
 * Valida que los campos requeridos de una dirección estén completos.
 * Retorna un string de error o null si es válida.
 */
export function validateAddress(value) {
  if (!value) return 'Domicilio requerido'
  if (!value.zip_code || value.zip_code.length !== 5) return 'Código postal inválido (5 dígitos)'
  if (!value.estado) return 'Estado requerido'
  if (!value.municipio) return 'Municipio requerido'
  const colonia = value.colonia === '__otra__' ? value.colonia_custom : value.colonia
  if (!colonia) return 'Colonia requerida'
  if (!value.street) return 'Calle y número requeridos'
  return null
}
