const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

function initTelemetry(serviceName) {
  let traceExporter = null;
  let logger;

  if (process.env.K_SERVICE) {
    // Cloud Run Environment
    try {
      const { TraceExporter } = require('@google-cloud/opentelemetry-cloud-trace-exporter');
      traceExporter = new TraceExporter();
      
      const { Logging } = require('@google-cloud/logging');
      const logging = new Logging();
      const log = logging.log(serviceName);
      
      logger = {
        info: (msg) => { console.log(msg); log.write(log.entry(msg)); },
        error: (msg, err) => { console.error(msg, err); log.write(log.entry({ severity: 'ERROR' }, msg)); }
      };
    } catch (e) {
      console.warn("GCP OTel/Logging packages not found. Falling back to local logging.");
      logger = {
        info: (msg) => console.log(`[INFO] ${msg}`),
        error: (msg, err) => console.error(`[ERROR] ${msg}`, err)
      };
    }
  } else {
    // Local Environment (Jaeger)
    try {
      const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
      traceExporter = new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'grpc://localhost:4317',
      });
      logger = {
        info: (msg) => console.log(`[INFO] ${msg}`),
        error: (msg, err) => console.error(`[ERROR] ${msg}`, err)
      };
    } catch (e) {
      console.warn("OTLP Exporter not found. Tracing disabled.");
      logger = {
          info: (msg) => console.log(`[INFO] ${msg}`),
          error: (msg, err) => console.error(`[ERROR] ${msg}`, err)
      };
    }
  }

  if (traceExporter) {
    const sdk = new NodeSDK({
      traceExporter,
      instrumentations: [getNodeAutoInstrumentations()]
    });

    try {
        sdk.start();
    } catch (err) {
        console.error("Error starting OTEL NodeSDK", err);
    }

    // Graceful shutdown
    process.on('SIGTERM', () => {
      sdk.shutdown()
        .then(() => logger.info('Tracing terminated'))
        .catch((error) => logger.error('Error terminating tracing', error))
        .finally(() => process.exit(0));
    });
  }
  
  // Generic error handler
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', error);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  });

  return logger;
}

module.exports = { initTelemetry };
