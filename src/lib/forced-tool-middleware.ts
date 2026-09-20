import type {
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult
} from "@ai-sdk/provider";
import type { LanguageModelMiddleware } from "ai";

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? trimmed;
}

export function parseForcedToolArguments(value: string): string | undefined {
  const candidate = stripJsonFence(value);
  if (!candidate) return undefined;

  try {
    const parsed: unknown = JSON.parse(candidate);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    return JSON.stringify(parsed);
  } catch {
    return undefined;
  }
}

export function selectAvailableToolName<const T extends string>(
  reportedName: string,
  availableTools: string[] | undefined,
  supportedTools: readonly T[]
): T | undefined {
  const soleAvailable =
    availableTools?.length === 1 ? availableTools[0] : undefined;
  if (
    soleAvailable &&
    supportedTools.some((toolName) => toolName === soleAvailable)
  ) {
    return soleAvailable as T;
  }
  return supportedTools.find((toolName) => reportedName.startsWith(toolName));
}

function isBufferedTextPart(part: LanguageModelV3StreamPart): boolean {
  return (
    part.type === "text-start" ||
    part.type === "text-delta" ||
    part.type === "text-end"
  );
}

function bufferedText(parts: LanguageModelV3StreamPart[]): string {
  return parts
    .filter(
      (part): part is Extract<LanguageModelV3StreamPart, { type: "text-delta" }> =>
        part.type === "text-delta"
    )
    .map((part) => part.delta)
    .join("");
}

/**
 * Workers AI's GPT-OSS stream can occasionally return the arguments for a
 * specifically forced tool as a JSON text block, or stop with no arguments,
 * instead of returning a structured tool call. Recover only those narrow
 * cases. The SDK still validates the recovered arguments against the selected
 * tool's schema before execution.
 */
export const forcedToolArgumentsMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  async wrapStream({ doStream, params }): Promise<LanguageModelV3StreamResult> {
    const result = await doStream();
    const forcedToolName =
      params.toolChoice?.type === "tool"
        ? params.toolChoice.toolName
        : undefined;
    if (!forcedToolName) return result;

    const bufferedParts: LanguageModelV3StreamPart[] = [];
    let pendingFinish:
      | Extract<LanguageModelV3StreamPart, { type: "finish" }>
      | undefined;
    let sawToolCall = false;
    let bufferedPartsFlushed = false;

    const flushBufferedParts = (
      controller: TransformStreamDefaultController<LanguageModelV3StreamPart>
    ) => {
      if (bufferedPartsFlushed) return;
      for (const part of bufferedParts) controller.enqueue(part);
      bufferedPartsFlushed = true;
    };

    const stream = result.stream.pipeThrough(
      new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
        transform(part, controller) {
          if (isBufferedTextPart(part) && !sawToolCall) {
            bufferedParts.push(part);
            return;
          }

          if (part.type === "finish") {
            pendingFinish = part;
            return;
          }

          if (part.type === "tool-input-start" || part.type === "tool-call") {
            sawToolCall = true;
            flushBufferedParts(controller);
          }
          controller.enqueue(part);
        },
        flush(controller) {
          if (sawToolCall) {
            flushBufferedParts(controller);
            if (pendingFinish) controller.enqueue(pendingFinish);
            return;
          }

          const leakedText = bufferedText(bufferedParts);
          const input = leakedText.trim()
            ? parseForcedToolArguments(leakedText)
            : "{}";
          if (!input) {
            flushBufferedParts(controller);
            if (pendingFinish) controller.enqueue(pendingFinish);
            return;
          }

          const toolCallId = `forced-${crypto.randomUUID()}`;
          controller.enqueue({
            type: "tool-input-start",
            id: toolCallId,
            toolName: forcedToolName
          });
          controller.enqueue({
            type: "tool-input-delta",
            id: toolCallId,
            delta: input
          });
          controller.enqueue({ type: "tool-input-end", id: toolCallId });
          controller.enqueue({
            type: "tool-call",
            toolCallId,
            toolName: forcedToolName,
            input
          });
          if (pendingFinish) {
            controller.enqueue({
              ...pendingFinish,
              finishReason: { unified: "tool-calls", raw: "stop" }
            });
          }
        }
      })
    );

    return { ...result, stream };
  }
};
