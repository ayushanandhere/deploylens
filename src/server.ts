import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { convertToModelMessages, streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import {
  MAX_INPUT_CHARACTERS,
  MAX_MODEL_MESSAGES,
  MAX_OUTPUT_TOKENS,
  MAX_PERSISTED_MESSAGES,
  MODEL_ID,
  SYSTEM_PROMPT
} from "./agent/system-prompt";

function textLength(parts: Array<{ type: string; text?: string }>): number {
  return parts.reduce(
    (total, part) => total + (part.type === "text" ? (part.text?.length ?? 0) : 0),
    0
  );
}

function latestUserMessage(messages: DeployLensAgent["messages"]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") return message;
  }
  return undefined;
}

export class DeployLensAgent extends AIChatAgent<Env> {
  maxPersistedMessages = MAX_PERSISTED_MESSAGES;
  chatRecovery = true as const;
  messageConcurrency = "drop" as const;

  async onChatMessage(
    _onFinish: unknown,
    options?: OnChatMessageOptions
  ): Promise<Response> {
    const latestMessage = latestUserMessage(this.messages);

    if (
      latestMessage &&
      textLength(latestMessage.parts) > MAX_INPUT_CHARACTERS
    ) {
      return new Response(
        `That message exceeds the ${MAX_INPUT_CHARACTERS.toLocaleString()} character limit. Please send a smaller, relevant, redacted excerpt.`,
        { headers: { "content-type": "text/plain; charset=utf-8" } }
      );
    }

    const workersAI = createWorkersAI({ binding: this.env.AI });
    const recentMessages = this.messages.slice(-MAX_MODEL_MESSAGES);

    const result = streamText({
      model: workersAI(MODEL_ID, { sessionAffinity: this.sessionAffinity }),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(recentMessages),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        console.error("Workers AI response failed", error);
        return "Workers AI could not complete the response. Check the Worker logs and AI binding, then try again.";
      }
    });
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
