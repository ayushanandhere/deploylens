export type Runbook = {
  id: "environment-variables" | "database-connection" | "upstream-connection";
  title: string;
  symptoms: string[];
  diagnosticQuestions: string[];
  suggestedChecks: string[];
  interpretations: string[];
  confirmationEvidence: string[];
  matchers: Array<{ signal: string; weight: number }>;
};

export const RUNBOOKS: Runbook[] = [
  {
    id: "environment-variables",
    title: "Missing or invalid environment variables",
    symptoms: [
      "Startup reports a required setting as missing, undefined, or invalid.",
      "A config-only release fails before the application begins serving traffic.",
      "Authentication or service initialization fails only in one environment."
    ],
    diagnosticQuestions: [
      "Which exact variable name is reported, without revealing its value?",
      "Did its binding, scope, or environment change in this deployment?",
      "Does the runtime distinguish an absent value from an empty value?"
    ],
    suggestedChecks: [
      "Compare the expected variable names and scopes with the deployed environment, while keeping values redacted.",
      "Confirm the variable is bound to the failing deployment stage and environment.",
      "Check whether validation rejects an empty or malformed value before startup."
    ],
    interpretations: [
      "Absent binding supports a missing-variable cause.",
      "A present but rejected value supports a formatting or validation cause.",
      "A correct binding weakens this runbook and calls for other evidence."
    ],
    confirmationEvidence: [
      "A source line naming the missing or invalid variable.",
      "A redacted configuration comparison showing the binding is absent or scoped incorrectly.",
      "A user-reported retry result after correcting only that binding."
    ],
    matchers: [
      { signal: "environment variable", weight: 4 },
      { signal: "not set", weight: 4 },
      { signal: "undefined", weight: 3 },
      { signal: "required", weight: 2 },
      { signal: "missing", weight: 2 },
      { signal: "invalid configuration", weight: 3 },
      { signal: "config", weight: 1 }
    ]
  },
  {
    id: "database-connection",
    title: "Database connection failures",
    symptoms: [
      "The application cannot open or maintain a database connection.",
      "Logs contain a SQLSTATE, database driver, pool, or database-port error.",
      "Requests fail after connection-pool exhaustion or database timeouts."
    ],
    diagnosticQuestions: [
      "Which database engine, host, and port are expected, with credentials redacted?",
      "Did connection settings, network policy, certificates, or database availability change?",
      "Is the failure a refusal, timeout, authentication rejection, or pool exhaustion?"
    ],
    suggestedChecks: [
      "Verify the redacted host, port, database name, and TLS mode used by the failing deployment.",
      "Check database health and whether it is listening on the expected interface and port.",
      "Compare the observed SQLSTATE or driver error with database and network logs at the same timestamp."
    ],
    interpretations: [
      "Connection refused supports an unavailable listener or wrong endpoint.",
      "A timeout supports a network path, firewall, saturation, or unavailable-host hypothesis.",
      "An authentication SQLSTATE supports credential or access-policy investigation."
    ],
    confirmationEvidence: [
      "A database-specific error code or driver message with a source-line reference.",
      "A user-reported connectivity or database-health check result.",
      "Correlated server-side evidence at the same timestamp."
    ],
    matchers: [
      { signal: "sqlstate", weight: 5 },
      { signal: "postgres", weight: 4 },
      { signal: "mysql", weight: 4 },
      { signal: "database", weight: 3 },
      { signal: "5432", weight: 4 },
      { signal: "3306", weight: 4 },
      { signal: "connection pool", weight: 3 },
      { signal: "econnrefused", weight: 2 }
    ]
  },
  {
    id: "upstream-connection",
    title: "Upstream connection failures and timeouts",
    symptoms: [
      "A proxy or service reports HTTP 502, 503, or 504.",
      "Requests to a dependent service time out, reset, or fail to connect.",
      "The deployment succeeds but health checks fail through a gateway."
    ],
    diagnosticQuestions: [
      "Which upstream service and route failed, and from which caller?",
      "Was the failure a DNS error, refusal, reset, timeout, or HTTP response?",
      "Did routing, service discovery, port, health checks, or timeout budgets change?"
    ],
    suggestedChecks: [
      "Verify the configured upstream host, port, protocol, and route without fetching arbitrary URLs through DeployLens.",
      "Compare gateway and upstream logs at the referenced timestamp.",
      "Have the operator test reachability and latency from the same runtime network path."
    ],
    interpretations: [
      "HTTP 502 or connection reset supports an unhealthy or prematurely closing upstream.",
      "HTTP 504 or timeout supports latency, reachability, or timeout-budget investigation.",
      "A healthy direct check with gateway-only failure supports proxy or routing configuration."
    ],
    confirmationEvidence: [
      "A referenced gateway or client error line naming the upstream failure.",
      "A correlated upstream health or request log.",
      "A user-reported network-path or latency check result."
    ],
    matchers: [
      { signal: "upstream", weight: 5 },
      { signal: "gateway timeout", weight: 5 },
      { signal: "http 502", weight: 4 },
      { signal: "http 503", weight: 4 },
      { signal: "http 504", weight: 4 },
      { signal: "econnreset", weight: 4 },
      { signal: "socket hang up", weight: 4 },
      { signal: "fetch failed", weight: 3 },
      { signal: "timed out", weight: 2 }
    ]
  }
];

export type RunbookMatch = {
  runbook: Runbook;
  score: number;
  matchedSignals: string[];
};

export function matchRunbook(signals: string[]): RunbookMatch | null {
  const haystack = signals.join("\n").toLowerCase();
  const ranked = RUNBOOKS.map((runbook) => {
    const matched = runbook.matchers.filter(({ signal }) =>
      haystack.includes(signal)
    );
    return {
      runbook,
      score: matched.reduce((total, item) => total + item.weight, 0),
      matchedSignals: matched.map((item) => item.signal)
    };
  }).sort((left, right) => right.score - left.score);

  const best = ranked[0];
  if (!best || best.score < 3) return null;
  const second = ranked[1];
  if (second && second.score === best.score) return null;
  return best;
}

export function getRunbook(runbookId: string): Runbook | undefined {
  return RUNBOOKS.find((runbook) => runbook.id === runbookId);
}
