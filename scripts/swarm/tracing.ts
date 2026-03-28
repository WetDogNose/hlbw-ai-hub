import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { trace } from "@opentelemetry/api";

const exporter = new OTLPTraceExporter({
  url: "http://localhost:4318/v1/traces",
});

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: "hlbw-swarm",
    [SemanticResourceAttributes.SERVICE_VERSION]: "1.0.0",
  }),
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});

export function startTracing() {
  try {
    sdk.start();
    console.log(
      "OTEL Tracing initialized locally (Jaeger: http://localhost:16686).",
    );
  } catch (error) {
    console.error("Error initializing tracing", error);
  }
}

export function stopTracing() {
  return sdk
    .shutdown()
    .catch((error) => console.log("Error shutting down tracing", error));
}

export function getTracer(name = "swarm-tracer") {
  return trace.getTracer(name);
}
