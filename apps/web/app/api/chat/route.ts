/**
 * /api/chat — streaming support-chatbot endpoint (Vercel AI SDK).
 *
 * Server-only: resolves an OpenAI-compatible model from env (Mistral by
 * default), injects the Bombe system prompt + guardrails, and streams tokens
 * back to the `useChat` widget. The client never supplies the system prompt or
 * the model; both are fixed here.
 *
 * Grounding: best-effort fetch of the live capability registry from the SDK so
 * "what can you attest" answers track real data. Falls back silently if the
 * registry cannot be summarized.
 *
 * Node runtime: the @bombe/agent-sdk import (used only for the schema summary)
 * pulls node built-ins, so this must not run on the Edge runtime.
 */
import { resolveChatModel } from "@/lib/chat-model";
import { buildSystemPrompt } from "@/lib/chat-system-prompt";
import { type CoreMessage, streamText } from "ai";

export const runtime = "nodejs";
export const maxDuration = 30;

// Guardrails enforced in code, not just in the prompt.
const MAX_INPUT_CHARS = 2000; // per-message cap
const MAX_MESSAGES = 24; // most recent turns sent to the model
const MAX_OUTPUT_TOKENS = 800;

interface IncomingMessage {
  role: string;
  content: unknown;
}

/** Server-side summary of the live capability registry, for grounding. */
function schemaSummary(): string | undefined {
  try {
    // Imported lazily so a registry shape change cannot break the route module.

    const { CAPABILITY_REGISTRY } = require("@bombe/agent-sdk") as {
      CAPABILITY_REGISTRY: ReadonlyArray<{
        claimType: string;
        tier: number | string;
        status: string;
      }>;
    };
    return CAPABILITY_REGISTRY.map((c) => `- ${c.claimType} (Tier ${c.tier}, ${c.status})`).join(
      "\n",
    );
  } catch {
    return undefined;
  }
}

/** Coerce + sanitize the client message list into CoreMessages. */
function sanitizeMessages(input: unknown): CoreMessage[] {
  if (!Array.isArray(input)) return [];
  const cleaned: CoreMessage[] = [];
  for (const raw of input as IncomingMessage[]) {
    if (!raw || (raw.role !== "user" && raw.role !== "assistant")) continue;
    const content = typeof raw.content === "string" ? raw.content : "";
    if (!content.trim()) continue;
    cleaned.push({
      role: raw.role,
      content: content.slice(0, MAX_INPUT_CHARS),
    });
  }
  // Keep only the most recent turns; the model gets bounded context.
  return cleaned.slice(-MAX_MESSAGES);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const messages = sanitizeMessages((body as { messages?: unknown })?.messages);
  if (messages.length === 0) {
    return new Response("No valid messages.", { status: 400 });
  }

  let resolved: ReturnType<typeof resolveChatModel>;
  try {
    resolved = resolveChatModel();
  } catch {
    return new Response(
      "The assistant is not configured. Set CHAT_API_KEY (or NARRATOR_PRIMARY_KEY / AI_GATEWAY_KEY).",
      { status: 503 },
    );
  }

  const result = streamText({
    model: resolved.model,
    system: buildSystemPrompt(schemaSummary()),
    messages,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.3,
  });

  return result.toDataStreamResponse();
}
