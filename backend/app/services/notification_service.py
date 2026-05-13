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
        <p>Tienes {settings.payment_window_hours} horas para confirmar el pago desde tu dashboard. El monto ya está retenido de tu saldo.</p>
        <a href="{settings.frontend_url}/dashboard" 
           style="background:#4f46e5;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:16px;">
           Ir al dashboard
        </a>
        """
        return await cls.send_email(
            to=to,
            subject=f"Pago pendiente: {auction_title} - ${amount}",
            html=html,
            text=f"Ganaste {auction_title} por ${amount}. Tienes {settings.payment_window_hours}h para pagar desde {settings.frontend_url}/dashboard",
        )

    @classmethod
    async def notify_payment_approved(cls, to: str, auction_title: str, auction_id: str) -> bool:
        html = f"""
        <h1>Pago confirmado</h1>
        <p>Tu pago por <strong>{auction_title}</strong> ha sido confirmado.</p>
        <p>Estamos preparando tu envío. Te notificaremos cuando sea enviado.</p>
        <a href="{settings.frontend_url}/auction/{auction_id}/shipping" 
           style="background:#4f46e5;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:16px;">
           Ver detalle de envío
        </a>
        """
        return await cls.send_email(
            to=to,
            subject=f"Pago confirmado: {auction_title}",
            html=html,
            text=f"Tu pago por {auction_title} fue confirmado. Verifica el envío en {settings.frontend_url}/auction/{auction_id}/shipping",
        )

    @classmethod
    async def notify_shipping_updated(cls, to: str, auction_title: str, status: str, tracking_number: Optional[str] = None) -> bool:
        tracking_html = f"<p>Número de guía: <strong>{tracking_number}</strong></p>" if tracking_number else ""
        html = f"""
        <h1>Actualización de envío</h1>
        <p>Tu artículo <strong>{auction_title}</strong> ha sido actualizado a: <strong>{status}</strong>.</p>
        {tracking_html}
        <p style="margin-top:24px;color:#666;font-size:12px;">
            Puedes consultar el estado en tu dashboard.
        </p>
        """
        return await cls.send_email(
            to=to,
            subject=f"Envío actualizado: {auction_title} - {status}",
            html=html,
            text=f"Tu envío de {auction_title} está ahora como {status}. {f'Guía: {tracking_number}' if tracking_number else ''}",
        )

    @classmethod
    async def notify_auction_overdue(cls, to: str, auction_title: str, amount: str, penalty: str) -> bool:
        penalty_html = f"<p>Penalización aplicada: <strong>${penalty}</strong></p>" if penalty and penalty != "0" else ""
        html = f"""
        <h1>Pago vencido</h1>
        <p>No completaste el pago de <strong>{auction_title}</strong> por <strong>${amount}</strong> dentro del plazo.</p>
        {penalty_html}
        <p>Has perdido la subasta. Tu saldo retenido ha sido liberado.</p>
        <p style="margin-top:24px;color:#666;font-size:12px;">
            Si acumulas 3 pagos vencidos, tu cuenta será bloqueada para pujar.
        </p>
        """
        return await cls.send_email(
            to=to,
            subject=f"Pago vencido: {auction_title}",
            html=html,
            text=f"No pagaste {auction_title} (${amount}) a tiempo. {f'Penalización: ${penalty}. ' if penalty and penalty != '0' else ''}Saldo liberado.",
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


class NotificationService:
    """In-app notification service (stores notifications in PostgreSQL)."""

    @classmethod
    async def create_notification(cls, user_id, type: str, title: str, message: str, db=None) -> bool:
        """Create an in-app notification for a user.

        Args:
            user_id: UUID of the recipient.
            type: One of 'auction_won', 'payment_approved', 'shipping_updated', 'payment_overdue'.
            title: Short title.
            message: Body text.
            db: Optional AsyncSession. If not provided, creates a new one.
        """
        from app.models.notification import Notification
        from app.core.database import AsyncSessionLocal
        from uuid import UUID

        close_session = False
        if db is None:
            db = AsyncSessionLocal()
            close_session = True

        try:
            notif = Notification(
                user_id=UUID(str(user_id)) if isinstance(user_id, str) else user_id,
                type=type,
                title=title,
                message=message,
            )
            db.add(notif)
            await db.commit()
            logger.info("notification_created", user_id=str(user_id), type=type, title=title)
            return True
        except Exception as exc:
            await db.rollback()
            logger.error("notification_create_failed", user_id=str(user_id), type=type, exc=str(exc))
            return False
        finally:
            if close_session:
                await db.close()
