import os
from typing import Optional

import httpx
import structlog

from app.core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "noreply@subastas.example.com")


class EmailService:
    """Email service using Resend API (free tier: 100 emails/day)."""

    BASE_URL = "https://api.resend.com/emails"

    @classmethod
    async def send_email(cls, to: str, subject: str, html: str, text: Optional[str] = None) -> bool:
        if not RESEND_API_KEY:
            logger.warning("email_skipped_no_api_key", to=to, subject=subject)
            return False

        payload = {
            "from": FROM_EMAIL,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        if text:
            payload["text"] = text

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    cls.BASE_URL,
                    headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
                    json=payload,
                    timeout=10.0,
                )
                if response.status_code == 200:
                    logger.info("email_sent", to=to, subject=subject, id=response.json().get("id"))
                    return True
                else:
                    logger.error("email_failed", to=to, status=response.status_code, body=response.text)
                    return False
        except Exception as exc:
            logger.error("email_exception", to=to, exc=str(exc))
            return False

    @classmethod
    async def notify_auction_won(cls, to: str, auction_title: str, final_price: str, auction_id: str) -> bool:
        html = f"""
        <h1>¡Felicidades! Ganaste la subasta</h1>
        <p>Has ganado la subasta: <strong>{auction_title}</strong></p>
        <p>Precio final: <strong>${final_price}</strong></p>
        <p>Para completar tu compra, selecciona el método de envío en tu dashboard:</p>
        <a href="{settings.frontend_url}/auction/{auction_id}/shipping" 
           style="background:#4f46e5;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:16px;">
           Seleccionar envío
        </a>
        <p style="margin-top:24px;color:#666;font-size:12px;">
            Si tienes alguna pregunta, contacta a soporte.
        </p>
        """
        return await cls.send_email(
            to=to,
            subject=f"¡Ganaste! {auction_title} - ${final_price}",
            html=html,
            text=f"Felicidades! Ganaste {auction_title} por ${final_price}. Ve a {settings.frontend_url}/auction/{auction_id}/shipping para seleccionar envío.",
        )

    @classmethod
    async def notify_auction_lost(cls, to: str, auction_title: str) -> bool:
        html = f"""
        <h1>Subasta finalizada</h1>
        <p>La subasta <strong>{auction_title}</strong> ha terminado.</p>
        <p>Desafortunadamente no resultaste ganador esta vez. ¡No te desanimes! Hay más subastas esperándote.</p>
        <a href="{settings.frontend_url}" 
           style="background:#4f46e5;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:16px;">
           Ver más subastas
        </a>
        """
        return await cls.send_email(
            to=to,
            subject=f"Subasta finalizada: {auction_title}",
            html=html,
            text=f"La subasta {auction_title} terminó. No ganaste esta vez. Visita {settings.frontend_url} para más subastas.",
        )

    @classmethod
    async def notify_no_sale(cls, to: str, auction_title: str) -> bool:
        html = f"""
        <h1>Subasta sin venta</h1>
        <p>La subasta <strong>{auction_title}</strong> terminó sin alcanzar el precio de reserva.</p>
        <p>Tu saldo retenido ha sido liberado.</p>
        """
        return await cls.send_email(
            to=to,
            subject=f"Subasta sin venta: {auction_title}",
            html=html,
            text=f"La subasta {auction_title} no alcanzó el precio de reserva. Tu saldo ha sido liberado.",
        )

    @classmethod
    async def notify_payment_required(cls, to: str, auction_title: str, amount: str, auction_id: str) -> bool:
        html = f"""
        <h1>Pago pendiente</h1>
        <p>Ganaste <strong>{auction_title}</strong> por <strong>${amount}</strong>.</p>
        <p>El monto ya fue retenido de tu saldo. Por favor completa el pago para procesar el envío.</p>
        <a href="{settings.frontend_url}/auction/{auction_id}/shipping" 
           style="background:#4f46e5;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:16px;">
           Completar pago y envío
        </a>
        """
        return await cls.send_email(
            to=to,
            subject=f"Pago pendiente: {auction_title} - ${amount}",
            html=html,
            text=f"Ganaste {auction_title} por ${amount}. Completa el pago en {settings.frontend_url}/auction/{auction_id}/shipping",
        )

    @classmethod
    async def notify_kyc_approved(cls, to: str) -> bool:
        html = """
        <h1>¡Verificación completada!</h1>
        <p>Tu identidad ha sido verificada exitosamente.</p>
        <p>Ahora puedes participar en subastas y realizar depósitos.</p>
        """
        return await cls.send_email(
            to=to,
            subject="Verificación de identidad aprobada",
            html=html,
            text="Tu KYC fue aprobado. Ya puedes participar en subastas.",
        )

    @classmethod
    async def notify_kyc_rejected(cls, to: str, notes: str = "") -> bool:
        html = f"""
        <h1>Verificación rechazada</h1>
        <p>Tu documentación no pudo ser verificada.</p>
        {f"<p><strong>Motivo:</strong> {notes}</p>" if notes else ""}
        <p>Por favor sube nueva documentación desde tu dashboard.</p>
        """
        return await cls.send_email(
            to=to,
            subject="Verificación de identidad rechazada",
            html=html,
            text=f"Tu KYC fue rechazada.{' Motivo: ' + notes if notes else ''} Sube nueva documentación.",
        )
