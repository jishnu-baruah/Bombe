/**
 * chat-model.ts — server-only resolver for the support-chatbot model provider.
 *
 * The chatbot talks to any OpenAI-compatible endpoint via @ai-sdk/openai's
 * createOpenAI(). Credentials are read from env, in priority order:
 *
 *   1. CHAT_API_KEY / CHAT_BASE_URL / CHAT_MODEL          (chatbot-specific override)
 *   2. NARRATOR_PRIMARY_KEY / NARRATOR_PRIMARY_BASE_URL /
 *      NARRATOR_PRIMARY_MODEL                              (Mistral, already used by the agent)
 *   3. AI_GATEWAY_KEY (+ AI_GATEWAY_BASE_URL / FALLBACK_MODEL)  (the shared AI gateway, gemma3)
 *
 * Sensible defaults: Mistral's OpenAI-compatible base URL and mistral-small-latest.
 * This module is server-only: it reads secrets and must never be imported by a
 * client component.
 */
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV1 } from "ai";

const MISTRAL_BASE_URL = "https://api.mistral.ai/v1";
const DEFAULT_MODEL = "mistral-small-latest";

export interface ResolvedChatModel {
  model: LanguageModelV1;
  modelId: string;
}

/** True when at least one usable API key is present in the environment. */
export function chatConfigured(): boolean {
  return Boolean(
    process.env.CHAT_API_KEY || process.env.NARRATOR_PRIMARY_KEY || process.env.AI_GATEWAY_KEY,
  );
}

/**
 * Resolve the chat model from env. Throws if no key is configured so the route
 * can return a clean 503 instead of a vague provider error.
 */
export function resolveChatModel(): ResolvedChatModel {
  const chatKey = process.env.CHAT_API_KEY;
  const narratorKey = process.env.NARRATOR_PRIMARY_KEY;
  const gatewayKey = process.env.AI_GATEWAY_KEY;

  let apiKey: string;
  let baseURL: string;
  let modelId: string;

  if (chatKey) {
    apiKey = chatKey;
    baseURL = process.env.CHAT_BASE_URL || MISTRAL_BASE_URL;
    modelId = process.env.CHAT_MODEL || DEFAULT_MODEL;
  } else if (narratorKey) {
    apiKey = narratorKey;
    baseURL = process.env.NARRATOR_PRIMARY_BASE_URL || MISTRAL_BASE_URL;
    modelId = process.env.NARRATOR_PRIMARY_MODEL || DEFAULT_MODEL;
  } else if (gatewayKey) {
    apiKey = gatewayKey;
    baseURL = process.env.AI_GATEWAY_BASE_URL || MISTRAL_BASE_URL;
    modelId = process.env.FALLBACK_MODEL || DEFAULT_MODEL;
  } else {
    throw new Error(
      "No chat model credentials. Set CHAT_API_KEY (or NARRATOR_PRIMARY_KEY / AI_GATEWAY_KEY).",
    );
  }

  // `compatibility: "compatible"` is the correct mode for non-OpenAI OpenAI-style
  // endpoints (Mistral, gateways); it omits OpenAI-only request fields.
  const provider = createOpenAI({ apiKey, baseURL, compatibility: "compatible" });
  return { model: provider.chat(modelId), modelId };
}
