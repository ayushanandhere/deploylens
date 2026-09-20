import type {
  InvestigationState,
  SourceLineReference
} from "./investigation-state";

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function sentence(value: string): string {
  const text = oneLine(value);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function referenceLabel(reference: SourceLineReference): string {
  return `${reference.sourceId}:L${reference.line}`;
}

function section(title: string, lines: string[]): string[] {
  return [`## ${title}`, "", ...(lines.length ? lines : ["_None recorded._"]), ""];
}

export function exportInvestigationMarkdown(
  state: InvestigationState,
  investigationId: string
): string {
  const output = [
    "# DeployLens investigation handoff",
    "",
    `- Investigation: \`${investigationId}\``,
    `- Status: **${state.status === "resolved" ? "Resolved by user" : "Investigating"}**`,
    `- Updated: ${state.updatedAt}`,
    ""
  ];

  output.push(
    ...section(
      "Reported symptoms",
      state.symptoms.trim() ? [oneLine(state.symptoms)] : []
    )
  );

  output.push(
    ...section(
      "Log sources",
      state.sources.map(
        (source) =>
          `- **${oneLine(source.label)}** — \`${source.sourceId}\`, ${source.lineCount} lines`
      )
    )
  );

  output.push(
    ...section(
      "Observed log evidence",
      state.evidence.map(
        (item) =>
          `- [${referenceLabel(item.reference)}] **${oneLine(item.summary)}**\n  > ${oneLine(item.excerpt)}`
      )
    )
  );

  output.push(
    ...section(
      "User-reported observations",
      state.userObservations.map((item) => `- ${oneLine(item.text)}`)
    )
  );

  output.push(
    ...section(
      "Hypotheses — unconfirmed",
      state.hypotheses.map((hypothesis) => {
        const references = hypothesis.evidence.length
          ? ` Evidence: ${hypothesis.evidence.map(referenceLabel).join(", ")}.`
          : " No supporting source reference recorded.";
        return `- **Unconfirmed:** ${sentence(hypothesis.text)}${references}`;
      })
    )
  );

  output.push(
    ...section(
      "Checks and reported results",
      state.checks.map((check) =>
        check.status === "completed"
          ? `- [x] ${oneLine(check.description)}\n  - **User-reported result:** ${oneLine(check.result ?? "No result text recorded")}`
          : `- [ ] ${oneLine(check.description)} — _not yet reported_`
      )
    )
  );

  output.push(
    ...section(
      "Open questions",
      state.openQuestions.map((question) => `- ${oneLine(question.text)}`)
    )
  );

  output.push("## Resolution", "");
  if (state.status === "resolved") {
    output.push(
      `**Marked resolved by the user.** ${oneLine(state.resolutionSummary ?? "")}`
    );
  } else {
    output.push(
      "_Unresolved. Hypotheses remain unconfirmed unless the evidence and reported checks above explicitly support them._"
    );
  }
  output.push("");

  return output.join("\n");
}
