import os
import logging
import sys
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

def init_telemetry(service_name: str):
    provider = TracerProvider()
    
    if os.environ.get('K_SERVICE'):
        try:
            from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
            import google.cloud.logging
            exporter = CloudTraceSpanExporter()
            client = google.cloud.logging.Client()
            client.setup_logging()
        except ImportError:
            logging.basicConfig(level=logging.INFO)
            logging.warning("GCP OTel/Logging packages not found. Falling back to local logging.")
            exporter = None
    else:
        try:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
            exporter = OTLPSpanExporter(endpoint=endpoint)
            logging.basicConfig(level=logging.INFO, stream=sys.stdout)
        except ImportError:
            logging.basicConfig(level=logging.INFO, stream=sys.stdout)
            logging.warning("OTLP Exporter not found. Tracing disabled.")
            exporter = None

    if exporter:
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
    
    # Generic error handler uncaught exceptions
    def handle_exception(exc_type, exc_value, exc_traceback):
        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc_value, exc_traceback)
            return
        logger = logging.getLogger(service_name)
        logger.error("Uncaught exception", exc_info=(exc_type, exc_value, exc_traceback))

    sys.excepthook = handle_exception
    
    return logging.getLogger(service_name)
