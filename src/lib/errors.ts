const CONFIGURATION_MARKERS = [
  "ai binding",
  "workers ai",
  "authentication",
  "not logged in",
  "unauthorized",
  "account id"
];

export function getErrorMessage(error: unknown): string {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const normalized = detail.toLowerCase();

  if (CONFIGURATION_MARKERS.some((marker) => normalized.includes(marker))) {
    return "Workers AI is not available. Verify the AI binding and authenticate Wrangler, then try again.";
  }

  if (
    normalized.includes("websocket") ||
    normalized.includes("network") ||
    normalized.includes("connection")
  ) {
    return "The connection to this investigation was interrupted. Check the development server and try again.";
  }

  if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return "This investigation reached a temporary rate limit. Wait for the stated retry window, then try again.";
  }

  return "DeployLens could not complete this response. Your investigation history is still saved; please try again.";
}
