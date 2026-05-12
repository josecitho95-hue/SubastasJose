"""Celery application entry-point and Beat schedule (TDD §6.3, §6.4, §9).

All task modules are imported here so Celery's autodiscovery picks them up
when the worker starts with ``-A app.tasks``.
"""
from app.tasks.persist_bid import celery_app  # noqa: F401 — exports celery_app
from app.tasks import close_auctions, reconcile, charge_winner  # noqa: F401

# Celery Beat schedule
celery_app.conf.beat_schedule = {
    "close-expired-auctions": {
        "task": "app.tasks.close_auctions.close_auctions",
        "schedule": 10.0,  # every 10 seconds (TDD §6.4)
    },
    "reconcile-redis-pg": {
        "task": "app.tasks.reconcile.reconcile_auctions",
        "schedule": 300.0,  # every 5 minutes (TDD §6.5)
    },
}

__all__ = ["celery_app"]
