from app.tasks.persist_bid import celery_app

# Celery Beat schedule
from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    "close-expired-auctions": {
        "task": "app.tasks.close_auctions.close_auctions",
        "schedule": 10.0,  # every 10 seconds
    },
    "reconcile-redis-pg": {
        "task": "app.tasks.reconcile.reconcile_auctions",
        "schedule": 300.0,  # every 5 minutes
    },
}

__all__ = ["celery_app"]
