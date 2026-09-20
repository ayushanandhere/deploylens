export type SyntheticExample = {
  id: "environment" | "database" | "upstream";
  title: string;
  description: string;
  sourceLabel: string;
  symptoms: string;
  logs: string;
};

export const SYNTHETIC_EXAMPLES: SyntheticExample[] = [
  {
    id: "environment",
    title: "Missing environment variable",
    description: "Startup failure after a configuration change",
    sourceLabel: "api-startup.log",
    symptoms: "The API deployment exits during startup after promoting staging configuration to production.",
    logs: [
      "2026-09-20T09:00:01.100Z INFO starting api revision 184",
      "2026-09-20T09:00:01.214Z ERROR required environment variable PAYMENT_API_URL is not set",
      "2026-09-20T09:00:01.215Z FATAL startup failed"
    ].join("\n")
  },
  {
    id: "database",
    title: "Database connection failure",
    description: "Repeated PostgreSQL connection refusals",
    sourceLabel: "checkout-worker.log",
    symptoms: "Checkout requests started failing immediately after a config-only deployment.",
    logs: [
      "2026-09-20T14:32:10.010Z INFO checkout worker started",
      "2026-09-20T14:32:11.120Z ERROR postgres connect ECONNREFUSED 10.0.4.21:5432",
      "2026-09-20T14:32:12.122Z ERROR postgres connect ECONNREFUSED 10.0.4.21:5432",
      "2026-09-20T14:32:13.125Z ERROR postgres connect ECONNREFUSED 10.0.4.21:5432",
      "2026-09-20T14:32:14.000Z INFO retry budget exhausted"
    ].join("\n")
  },
  {
    id: "upstream",
    title: "Upstream timeout",
    description: "Gateway timeouts calling an internal service",
    sourceLabel: "edge-gateway.log",
    symptoms: "The deployment completed, but the public health route now returns 504.",
    logs: [
      "2026-09-20T18:04:20.000Z INFO GET /health request_id=req-81",
      "2026-09-20T18:04:25.001Z ERROR upstream payments.internal timed out after 5000ms HTTP 504",
      "2026-09-20T18:04:25.002Z WARN gateway returned HTTP 504 request_id=req-81"
    ].join("\n")
  }
];

export function getSyntheticExample(
  exampleId: string
): SyntheticExample | undefined {
  return SYNTHETIC_EXAMPLES.find((example) => example.id === exampleId);
}
