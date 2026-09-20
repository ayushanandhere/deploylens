import type {
  EvidenceItem,
  LogSourceSummary
} from "./investigation-state";

export const MAX_LOG_CHARACTERS = 80_000;
export const MAX_LOG_LINES = 2_000;
export const MAX_LOG_SOURCES = 10;

export type LogSubmission = {
  label: string;
  text: string;
  symptoms?: string;
};

export type TimestampFinding = {
  value: string;
  line: number;
};

export type ErrorLineFinding = {
  line: number;
  excerpt: string;
  timestamp?: string;
  codes: string[];
};

export type ErrorCodeFinding = {
  code: string;
  lines: number[];
};

export type RepeatedPatternFinding = {
  pattern: string;
  count: number;
  lines: number[];
};

export type LogAnalysis = {
  sourceId: string;
  lineCount: number;
  timestamps: TimestampFinding[];
  errorLines: ErrorLineFinding[];
  errorCodes: ErrorCodeFinding[];
  repeatedPatterns: RepeatedPatternFinding[];
  unrecognizedLineCount: number;
  unrecognizedLines: Array<{ line: number; excerpt: string }>;
};

const TIMESTAMP_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/,
  /\b\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?\b/,
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\b/i
];
const ERROR_PATTERN =
  /\b(error|exception|fatal|panic|failed|failure|refused|timed?\s*out|unavailable|denied|invalid|missing|required|reset)\b/i;
const ERROR_CODE_PATTERNS = [
  /\bHTTP[\s_-]*[45]\d{2}\b/gi,
  /\bSQLSTATE[\s:_-]*[A-Z0-9]{5}\b/gi,
  /\bE(?:CONNREFUSED|CONNRESET|HOSTUNREACH|NETUNREACH|TIMEDOUT|PIPE|AI_AGAIN|ACCES|ADDRINUSE|ADDRNOTAVAIL|NOTFOUND|PROTO)\b/g,
  /\bERR_[A-Z0-9_]+\b/g,
  /\b(?:ORA|ERR|ERROR)[-_]?\d{3,6}\b/gi
];

export function splitLogLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/);
}

export function validateLogSubmission(value: unknown): LogSubmission {
  if (!value || typeof value !== "object") {
    throw new Error("A log label and pasted log text are required.");
  }
  const candidate = value as Partial<LogSubmission>;
  if (typeof candidate.label !== "string" || !candidate.label.trim()) {
    throw new Error("Log source label is required.");
  }
  if (candidate.label.trim().length > 80) {
    throw new Error("Log source label must be 80 characters or fewer.");
  }
  if (typeof candidate.text !== "string") {
    throw new Error("Pasted logs must be plain text.");
  }
  if (!candidate.text.trim()) {
    throw new Error("Pasted logs cannot be empty.");
  }
  if (candidate.text.includes("\0")) {
    throw new Error("Pasted logs contain an unsupported null character.");
  }
  if (candidate.text.length > MAX_LOG_CHARACTERS) {
    throw new Error(
      `Pasted logs exceed the ${MAX_LOG_CHARACTERS.toLocaleString()} character limit.`
    );
  }
  const lineCount = splitLogLines(candidate.text).length;
  if (lineCount > MAX_LOG_LINES) {
    throw new Error(
      `Pasted logs exceed the ${MAX_LOG_LINES.toLocaleString()} line limit.`
    );
  }
  if (
    candidate.symptoms !== undefined &&
    (typeof candidate.symptoms !== "string" || candidate.symptoms.length > 4_000)
  ) {
    throw new Error("Symptom description must be 4,000 characters or fewer.");
  }
  return {
    label: candidate.label.trim(),
    text: candidate.text,
    symptoms: candidate.symptoms?.trim()
  };
}

function extractTimestamp(line: string): string | undefined {
  for (const pattern of TIMESTAMP_PATTERNS) {
    const value = line.match(pattern)?.[0];
    if (value) return value;
  }
  return undefined;
}

function extractCodes(line: string): string[] {
  const codes = new Set<string>();
  for (const pattern of ERROR_CODE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of line.matchAll(pattern)) {
      const code = match[0]
        .toUpperCase()
        .replace(/[\s:_]+/g, "-")
        .replace(/^HTTP-?/, "HTTP ")
        .replace(/^SQLSTATE-?/, "SQLSTATE ");
      if (code === "ERROR") continue;
      codes.add(code);
    }
  }
  return [...codes];
}

function normalizeRepeatedPattern(line: string, timestamp?: string): string {
  const withoutTimestamp = timestamp ? line.replace(timestamp, "") : line;
  return withoutTimestamp.replace(/^\s*[-–—|:[\]]+/, "").trim();
}

export function analyzeLogText(sourceId: string, text: string): LogAnalysis {
  const lines = splitLogLines(text);
  const timestamps: TimestampFinding[] = [];
  const errorLines: ErrorLineFinding[] = [];
  const codesToLines = new Map<string, number[]>();
  const repeated = new Map<string, number[]>();
  const unrecognizedLines: Array<{ line: number; excerpt: string }> = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const timestamp = extractTimestamp(line);
    if (timestamp) timestamps.push({ value: timestamp, line: lineNumber });
    const codes = extractCodes(line);
    const isError = ERROR_PATTERN.test(line) || codes.length > 0;

    for (const code of codes) {
      const existing = codesToLines.get(code) ?? [];
      existing.push(lineNumber);
      codesToLines.set(code, existing);
    }

    if (isError) {
      const excerpt = line.slice(0, 500);
      errorLines.push({ line: lineNumber, excerpt, timestamp, codes });
      const pattern = normalizeRepeatedPattern(line, timestamp);
      if (pattern) {
        const existing = repeated.get(pattern) ?? [];
        existing.push(lineNumber);
        repeated.set(pattern, existing);
      }
    } else {
      unrecognizedLines.push({ line: lineNumber, excerpt: line.slice(0, 500) });
    }
  });

  return {
    sourceId,
    lineCount: lines.length,
    timestamps,
    errorLines,
    errorCodes: [...codesToLines.entries()].map(([code, codeLines]) => ({
      code,
      lines: codeLines
    })),
    repeatedPatterns: [...repeated.entries()]
      .filter(([, patternLines]) => patternLines.length > 1)
      .map(([pattern, patternLines]) => ({
        pattern,
        count: patternLines.length,
        lines: patternLines
      })),
    unrecognizedLineCount: unrecognizedLines.length,
    unrecognizedLines
  };
}

export function analysisToEvidence(
  source: LogSourceSummary,
  analysis: LogAnalysis,
  idFactory: () => string = () => crypto.randomUUID()
): EvidenceItem[] {
  const evidence: EvidenceItem[] = analysis.errorLines.map((finding) => ({
    id: `evidence-${idFactory()}`,
    kind: "log",
    category: "error",
    summary: finding.codes.length
      ? `Error line with ${finding.codes.join(", ")}`
      : "Recognizable error line",
    excerpt: finding.excerpt,
    reference: { sourceId: source.sourceId, line: finding.line }
  }));

  for (const repeated of analysis.repeatedPatterns) {
    evidence.push({
      id: `evidence-${idFactory()}`,
      kind: "log",
      category: "repeated-pattern",
      summary: `Repeated ${repeated.count} times`,
      excerpt: repeated.pattern.slice(0, 500),
      reference: { sourceId: source.sourceId, line: repeated.lines[0] ?? 1 },
      relatedLines: repeated.lines
    });
  }
  return evidence;
}
