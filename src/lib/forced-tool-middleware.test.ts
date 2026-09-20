import type {
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult
} from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import {
  forcedToolArgumentsMiddleware,
  parseForcedToolArguments,
  selectAvailableToolName
} from "./forced-tool-middleware";

function streamOf(
  parts: LanguageModelV3StreamPart[]
): ReadableStream<LanguageModelV3StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    }
  });
}

async function applyMiddleware(parts: LanguageModelV3StreamPart[]) {
  const wrapStream = forcedToolArgumentsMiddleware.wrapStream;
  if (!wrapStream) throw new Error("Expected stream middleware.");
  const result = await wrapStream({
    doGenerate: async () => {
      throw new Error("Not used by this test.");
    },
    doStream: async (): Promise<LanguageModelV3StreamResult> => ({
      stream: streamOf(parts)
    }),
    params: {
      prompt: [],
      toolChoice: { type: "tool", toolName: "analyzeLogs" }
    } satisfies LanguageModelV3CallOptions,
    model: {} as never
  });
  const output: LanguageModelV3StreamPart[] = [];
  for await (const part of result.stream) output.push(part);
  return output;
}

describe("forced tool argument recovery", () => {
  it("repairs an unavailable model-selected tool to the sole active tool", () => {
    expect(
      selectAvailableToolName(
        "updateInvestigation",
        ["analyzeLogs"],
        ["analyzeLogs", "lookupRunbook", "updateInvestigation"]
      )
    ).toBe("analyzeLogs");
  });

  it("accepts only complete JSON objects", () => {
    expect(parseForcedToolArguments('{"sourceId":"LOG-1"}')).toBe(
      '{"sourceId":"LOG-1"}'
    );
    expect(parseForcedToolArguments('```json\n{"sourceId":"LOG-1"}\n```')).toBe(
      '{"sourceId":"LOG-1"}'
    );
    expect(parseForcedToolArguments("explanation then JSON {}"))
      .toBeUndefined();
    expect(parseForcedToolArguments("[]")).toBeUndefined();
  });

  it("turns leaked JSON text into the specifically forced tool call", async () => {
    const output = await applyMiddleware([
      { type: "text-start", id: "text-1" },
      {
        type: "text-delta",
        id: "text-1",
        delta: '{"sourceId":"LOG-1"}'
      },
      { type: "text-end", id: "text-1" },
      {
        type: "finish",
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 }
        },
        finishReason: { unified: "stop", raw: "stop" }
      }
    ]);

    expect(output.some((part) => part.type.startsWith("text-"))).toBe(false);
    expect(output).toContainEqual(
      expect.objectContaining({
        type: "tool-call",
        toolName: "analyzeLogs",
        input: '{"sourceId":"LOG-1"}'
      })
    );
    expect(output.at(-1)).toEqual(
      expect.objectContaining({
        type: "finish",
        finishReason: { unified: "tool-calls", raw: "stop" }
      })
    );
  });

  it("preserves non-JSON text instead of guessing tool arguments", async () => {
    const output = await applyMiddleware([
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "I need more evidence." },
      { type: "text-end", id: "text-1" }
    ]);
    expect(output).toEqual([
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "I need more evidence." },
      { type: "text-end", id: "text-1" }
    ]);
  });

  it("turns an empty forced response into schema-validated empty arguments", async () => {
    const output = await applyMiddleware([
      {
        type: "finish",
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 0, text: 0, reasoning: 0 }
        },
        finishReason: { unified: "stop", raw: "stop" }
      }
    ]);

    expect(output).toContainEqual(
      expect.objectContaining({
        type: "tool-call",
        toolName: "analyzeLogs",
        input: "{}"
      })
    );
  });
});
