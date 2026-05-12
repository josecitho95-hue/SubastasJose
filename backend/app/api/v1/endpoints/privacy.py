from fastapi import APIRouter

router = APIRouter()

PRIVACY_NOTICE = """
# Aviso de Privacidad

**Responsable:** Subastas en Línea S.A. de C.V.
**Domicilio:** [Tu dirección]
**Email:** privacidad@subastas.example.com

## Datos que recopilamos
- Identidad (nombre, email, teléfono)
- Documentos de verificación (INE, pasaporte, comprobante de domicilio)
- Información de pago (procesada por Stripe)
- Dirección de envío

## Finalidades
1. Verificación de identidad para cumplimiento legal (LFPIORPI)
2. Procesamiento de pagos y depósitos en garantía
3. Envío de artículos ganados
4. Comunicaciones sobre subastas

## Derechos ARCO
Puedes ejercer tus derechos de Acceso, Rectificación, Cancelación y Oposición enviando un email a privacidad@subastas.example.com. Responderemos en un plazo de 20 días hábiles.

## Transferencias
No transferimos datos personales a terceros sin tu consentimiento, salvo obligación legal o para el procesamiento de pagos (Stripe).

## Seguridad
Tus documentos KYC están cifrados en reposo. El acceso está restringido a personal autorizado.
"""

@router.get("/aviso-privacidad")
async def privacy_notice():
    return {"title": "Aviso de Privacidad", "content": PRIVACY_NOTICE}
