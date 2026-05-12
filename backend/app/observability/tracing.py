"""OpenTelemetry distributed tracing configuration (TDD §3, §9).

Provides helpers to configure the OTLP trace exporter and to retrieve a tracer
for annotating the hot path (WS → Lua → PG) with distributed spans.
"""
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource, SERVICE_NAME
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

import structlog

from app.core.config import get_settings

settings = get_settings()
logger = structlog.get_logger()


def configure_tracing() -> None:
    """Initialise the OpenTelemetry tracer provider.

    If ``OTEL_EXPORTER_OTLP_ENDPOINT`` is set, spans are exported to that
    collector (e.g. Jaeger / Tempo).  Otherwise they are printed to stdout
    (useful during local development to verify instrumentation is working).
    """
    resource = Resource(attributes={SERVICE_NAME: settings.otel_service_name})
    provider = TracerProvider(resource=resource)

    if settings.otel_exporter_otlp_endpoint:
        exporter = OTLPSpanExporter(endpoint=settings.otel_exporter_otlp_endpoint)
        logger.info(
            "otel_exporter_configured",
            endpoint=settings.otel_exporter_otlp_endpoint,
        )
    else:
        exporter = ConsoleSpanExporter()
        logger.info("otel_exporter_console_fallback")

    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)


def get_tracer(name: str = "subastas") -> trace.Tracer:
    """Return a named tracer for manual span creation.

    Args:
        name: Instrumentation scope name (defaults to 'subastas').

    Returns:
        An :class:`opentelemetry.trace.Tracer` instance.
    """
    return trace.get_tracer(name)
