export type InvestigationStatus = "investigating" | "resolved";

export type SourceLineReference = {
  sourceId: string;
  line: number;
};

export type LogSourceSummary = {
  sourceId: string;
  label: string;
  lineCount: number;
  createdAt: string;
};

export type EvidenceItem = {
  id: string;
  kind: "log";
  category: "error" | "error-code" | "repeated-pattern";
  summary: string;
  excerpt: string;
  reference: SourceLineReference;
  relatedLines?: number[];
};

export type UserObservation = {
  id: string;
  text: string;
  createdAt: string;
};

export type Hypothesis = {
  id: string;
  text: string;
  status: "unconfirmed";
  evidence: SourceLineReference[];
  createdAt: string;
};

export type InvestigationCheck = {
  id: string;
  description: string;
  status: "suggested" | "completed";
  result?: string;
  createdAt: string;
  completedAt?: string;
};

export type OpenQuestion = {
  id: string;
  text: string;
};

export type RunbookMatchSummary = {
  runbookId: string;
  title: string;
  matchedSignals: string[];
  score: number;
};

export type InvestigationState = {
  version: 2;
  status: InvestigationStatus;
  symptoms: string;
  sources: LogSourceSummary[];
  evidence: EvidenceItem[];
  userObservations: UserObservation[];
  hypotheses: Hypothesis[];
  checks: InvestigationCheck[];
  openQuestions: OpenQuestion[];
  runbookMatches: RunbookMatchSummary[];
  resolutionSummary?: string;
  updatedAt: string;
};

export type ModelInvestigationUpdate = {
  hypotheses?: Array<{
    text: string;
    evidence?: SourceLineReference[];
  }>;
  suggestedChecks?: string[];
  openQuestions?: string[];
};

const MAX_ITEM_LENGTH = 1_000;
export const MAX_USER_OBSERVATIONS = 50;
export const MAX_INVESTIGATION_CHECKS = 30;

function cleanText(value: string, label: string, max = MAX_ITEM_LENGTH): string {
  const text = value.trim();
  if (!text) throw new Error(`${label} cannot be empty.`);
  if (text.length > max) {
    throw new Error(`${label} must be ${max.toLocaleString()} characters or fewer.`);
  }
  return text;
}

export function createInitialInvestigationState(
  now = new Date().toISOString()
): InvestigationState {
  return {
    version: 2,
    status: "investigating",
    symptoms: "",
    sources: [],
    evidence: [],
    userObservations: [],
    hypotheses: [],
    checks: [],
    openQuestions: [],
    runbookMatches: [],
    updatedAt: now
  };
}

export function normalizeInvestigationState(
  value: unknown,
  now = new Date().toISOString()
): InvestigationState {
  if (!value || typeof value !== "object") {
    return createInitialInvestigationState(now);
  }
  const candidate = value as Partial<InvestigationState>;
  return {
    ...createInitialInvestigationState(now),
    ...candidate,
    version: 2,
    status: candidate.status === "resolved" ? "resolved" : "investigating",
    symptoms: typeof candidate.symptoms === "string" ? candidate.symptoms : "",
    sources: Array.isArray(candidate.sources) ? candidate.sources : [],
    evidence: Array.isArray(candidate.evidence) ? candidate.evidence : [],
    userObservations: Array.isArray(candidate.userObservations)
      ? candidate.userObservations
      : [],
    hypotheses: Array.isArray(candidate.hypotheses) ? candidate.hypotheses : [],
    checks: Array.isArray(candidate.checks) ? candidate.checks : [],
    openQuestions: Array.isArray(candidate.openQuestions)
      ? candidate.openQuestions
      : [],
    runbookMatches: Array.isArray(candidate.runbookMatches)
      ? candidate.runbookMatches
      : []
  };
}

export function validateSourceReference(
  reference: SourceLineReference,
  sources: LogSourceSummary[]
): SourceLineReference {
  const source = sources.find((item) => item.sourceId === reference.sourceId);
  if (!source) {
    throw new Error(
      `Source ${reference.sourceId} does not belong to this investigation.`
    );
  }
  if (!Number.isInteger(reference.line) || reference.line < 1) {
    throw new Error("Source line references must use positive whole numbers.");
  }
  if (reference.line > source.lineCount) {
    throw new Error(
      `${reference.sourceId} has ${source.lineCount} lines; line ${reference.line} does not exist.`
    );
  }
  return reference;
}

export function applyModelInvestigationUpdate(
  stateValue: InvestigationState,
  update: ModelInvestigationUpdate,
  options: {
    now?: string;
    idFactory?: () => string;
  } = {}
): InvestigationState {
  const state = normalizeInvestigationState(stateValue);
  const now = options.now ?? new Date().toISOString();
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());

  const hypotheses = update.hypotheses
    ? update.hypotheses.slice(0, 12).map((item) => ({
        id: `hyp-${idFactory()}`,
        text: cleanText(item.text, "Hypothesis"),
        status: "unconfirmed" as const,
        evidence: (item.evidence ?? []).slice(0, 12).map((reference) =>
          validateSourceReference(reference, state.sources)
        ),
        createdAt: now
      }))
    : state.hypotheses;

  const checks = [...state.checks];
  for (const suggestion of (update.suggestedChecks ?? []).slice(0, 12)) {
    if (checks.length >= MAX_INVESTIGATION_CHECKS) break;
    const description = cleanText(suggestion, "Suggested check");
    const duplicate = checks.some(
      (item) => item.description.toLowerCase() === description.toLowerCase()
    );
    if (!duplicate) {
      checks.push({
        id: `check-${idFactory()}`,
        description,
        status: "suggested",
        createdAt: now
      });
    }
  }

  const openQuestions = update.openQuestions
    ? update.openQuestions.slice(0, 12).map((question) => ({
        id: `question-${idFactory()}`,
        text: cleanText(question, "Open question")
      }))
    : state.openQuestions;

  return {
    ...state,
    hypotheses,
    checks,
    openQuestions,
    updatedAt: now
  };
}

export function recordCheckResult(
  stateValue: InvestigationState,
  checkId: string,
  resultValue: string,
  now = new Date().toISOString()
): InvestigationState {
  const state = normalizeInvestigationState(stateValue);
  const result = cleanText(resultValue, "Check result", 4_000);
  let found = false;
  const checks = state.checks.map((check) => {
    if (check.id !== checkId) return check;
    found = true;
    return {
      ...check,
      status: "completed" as const,
      result,
      completedAt: now
    };
  });
  if (!found) throw new Error("That suggested check does not exist.");
  return { ...state, checks, updatedAt: now };
}

export function setInvestigationStatus(
  stateValue: InvestigationState,
  status: InvestigationStatus,
  summaryValue = "",
  now = new Date().toISOString()
): InvestigationState {
  const state = normalizeInvestigationState(stateValue);
  if (status === "resolved") {
    const resolutionSummary = cleanText(
      summaryValue,
      "Resolution summary",
      2_000
    );
    return { ...state, status, resolutionSummary, updatedAt: now };
  }
  const { resolutionSummary: _oldSummary, ...withoutSummary } = state;
  return { ...withoutSummary, status, updatedAt: now };
}

export function hasInvestigationContent(stateValue: InvestigationState): boolean {
  const state = normalizeInvestigationState(stateValue);
  return Boolean(
    state.symptoms.trim() ||
      state.sources.length ||
      state.userObservations.length ||
      state.hypotheses.length ||
      state.checks.length
  );
}
