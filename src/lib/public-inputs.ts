import { isInvestigationId } from "./investigation";

function requiredString(
  value: unknown,
  label: string,
  maxLength: number
): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be text.`);
  }
  const text = value.trim();
  if (!text) throw new Error(`${label} cannot be empty.`);
  if (text.length > maxLength) {
    throw new Error(
      `${label} must be ${maxLength.toLocaleString()} characters or fewer.`
    );
  }
  return text;
}

export function parseExampleId(
  value: unknown
): "environment" | "database" | "upstream" {
  if (value === "environment" || value === "database" || value === "upstream") {
    return value;
  }
  throw new Error("Example identifier is invalid.");
}

export function parseSourceId(value: unknown): string {
  const sourceId = requiredString(value, "Source identifier", 64);
  if (!/^LOG-[A-F0-9]{10}$/.test(sourceId)) {
    throw new Error("Source identifier is invalid.");
  }
  return sourceId;
}

export function parseObservation(value: unknown): string {
  return requiredString(value, "Observation", 2_000);
}

export function parseCheckResult(
  checkIdValue: unknown,
  resultValue: unknown
): { checkId: string; result: string } {
  return {
    checkId: requiredString(checkIdValue, "Check identifier", 80),
    result: requiredString(resultValue, "Check result", 4_000)
  };
}

export function parseStatusChange(
  statusValue: unknown,
  resolutionSummaryValue: unknown
): { status: "investigating" | "resolved"; resolutionSummary: string } {
  if (statusValue !== "investigating" && statusValue !== "resolved") {
    throw new Error("Investigation status must be resolved or investigating.");
  }
  if (typeof resolutionSummaryValue !== "string") {
    throw new Error("Resolution summary must be text.");
  }
  const resolutionSummary = resolutionSummaryValue.trim();
  if (resolutionSummary.length > 2_000) {
    throw new Error("Resolution summary must be 2,000 characters or fewer.");
  }
  if (statusValue === "resolved" && !resolutionSummary) {
    throw new Error("Resolution summary cannot be empty.");
  }
  return { status: statusValue, resolutionSummary };
}

export function parseInvestigationId(value: unknown): string {
  if (typeof value !== "string" || !isInvestigationId(value)) {
    throw new Error("Investigation identifier is invalid.");
  }
  return value;
}

export function rejectClientStateChange(source: unknown): void {
  if (source !== "server") {
    throw new Error(
      "Direct client state updates are disabled; use a validated investigation method."
    );
  }
}
