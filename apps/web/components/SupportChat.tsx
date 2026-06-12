"use client";

/**
 * SupportChat — floating, on-brand support chatbot widget.
 *
 * Bottom-right launcher button + slide-up glass panel. Streams from
 * /api/chat via the AI SDK `useChat` hook (token streaming). Renders assistant
 * replies as Markdown. Client-only: it never imports server modules or the
 * @bombe/agent-sdk barrel (that would pull node:fs and break the webpack
 * build). All model and prompt logic lives in the route.
 *
 * Mounted once globally in app/layout.tsx so it appears on every page.
 *
 * Accessibility: launcher and panel are labelled; Esc closes; focus moves to
 * the input on open and back to the launcher on close.
 */

import { useChat } from "@ai-sdk/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MAX_INPUT_CHARS = 2000;

const SUGGESTIONS = [
  "What is Bombe?",
  "How do I verify an attestation?",
  "What claim types can you attest?",
  "Why does Tier 3 abstain?",
] as const;

function ChatIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

/** Markdown link: internal routes use next/link, externals open in a new tab. */
function MarkdownLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  const url = href ?? "#";
  const isInternal = url.startsWith("/");
  const cls = "text-[#9296f5] underline underline-offset-2 hover:text-white transition-colors";
  if (isInternal) {
    return (
      <Link href={url} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className={cls}>
      {children}
    </a>
  );
}

function Bubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-[16px] rounded-br-[4px] bg-[#494fdf] px-3.5 py-2.5 text-[14px] leading-relaxed text-white"
            : "max-w-[90%] rounded-[16px] rounded-bl-[4px] border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-[14px] leading-relaxed text-white/90"
        }
      >
        {children}
      </div>
    </div>
  );
}

/** A human label for the tool currently running, shown as a "checking…" affordance. */
const TOOL_LABEL: Record<string, string> = {
  verifyClaim: "Verifying on-chain",
  recommendAssets: "Checking attestable assets",
  listCapabilities: "Reading the capability registry",
};

/**
 * Render an assistant message from its streamed `parts`. Text parts render as
 * Markdown; an in-flight tool call renders as a small "checking…" affordance
 * (never raw JSON). Falls back to `content` for any message without parts.
 */
function AssistantMessage({
  message,
}: {
  message: { content: string; parts?: Array<Record<string, unknown>> };
}) {
  const parts = message.parts;
  if (!parts || parts.length === 0) {
    return (
      <div className="chat-md">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
          {message.content}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        const type = part.type as string;
        if (type === "text") {
          const text = (part.text as string) ?? "";
          if (!text.trim()) return null;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: streamed parts have no stable id; order is stable within a message.
            <div className="chat-md" key={`t-${i}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
                {text}
              </ReactMarkdown>
            </div>
          );
        }
        if (type === "tool-invocation") {
          const inv = (part.toolInvocation ?? {}) as {
            toolName?: string;
            state?: string;
          };
          // Only show the affordance while the tool is running; once it has a
          // result the model's follow-up text part carries the answer.
          if (inv.state === "result") return null;
          const label = (inv.toolName && TOOL_LABEL[inv.toolName]) || "Checking";
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: streamed parts have no stable id; order is stable within a message.
            <div className="flex items-center gap-2 text-[13px] text-white/55" key={`tool-${i}`}>
              <span className="flex gap-0.5" aria-hidden="true">
                <span className="h-1.5 w-1.5 animate-[chat-dot_1s_infinite] rounded-full bg-white/45" />
                <span className="h-1.5 w-1.5 animate-[chat-dot_1s_0.15s_infinite] rounded-full bg-white/45" />
                <span className="h-1.5 w-1.5 animate-[chat-dot_1s_0.3s_infinite] rounded-full bg-white/45" />
              </span>
              <span>{label}…</span>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, status, stop, setMessages, setInput } =
    useChat({
      api: "/api/chat",
    });

  const isStreaming = status === "submitted" || status === "streaming";

  // Auto-scroll to the latest message as tokens stream in. The growing text of
  // the last message and the streaming status are the scroll triggers.
  const lastContent = messages[messages.length - 1]?.content ?? "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: lastContent + isStreaming are intentional scroll triggers; the effect mutates a ref and reads no other reactive value.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastContent, isStreaming]);

  // Focus management: input on open, launcher on close.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
    launcherRef.current?.focus();
  }, [open]);

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const submit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (isStreaming || !input.trim()) return;
      handleSubmit(e);
    },
    [handleSubmit, input, isStreaming],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const reset = () => {
    stop();
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  };

  const ask = (q: string) => {
    setInput(q);
    inputRef.current?.focus();
  };

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Bombe support chat"
          className="fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-[#494fdf] text-white shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-150 hover:bg-[#4f55f1] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9296f5]"
        >
          <ChatIcon />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          // biome-ignore lint/a11y/useSemanticElements: a non-modal floating chat panel intentionally uses role="dialog" on a div; native <dialog> forces modal/top-layer semantics we do not want.
          role="dialog"
          aria-modal="false"
          aria-label="Bombe support chat"
          className="fixed bottom-5 right-5 z-[60] flex h-[min(640px,calc(100dvh-2.5rem))] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-[20px] border border-white/10 bg-[#16181a]/95 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-[20px] animate-[chat-in_0.22s_cubic-bezier(0.22,1,0.36,1)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#494fdf] text-white">
                <ChatIcon />
              </span>
              <div className="leading-tight">
                <p className="font-display text-[15px] font-semibold tracking-[-0.02em] text-white">
                  Bombe assistant
                </p>
                <p className="font-mono text-[10px] tracking-[0.14em] text-[#9296f5]">
                  RWA ATTESTATION HELP
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={reset}
                  aria-label="Clear conversation"
                  className="rounded-full px-2 py-1 text-[12px] text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9296f5]"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9296f5]"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col justify-center">
                <p className="pretty text-[14px] leading-relaxed text-white/80">
                  Hi. I can explain how Bombe attests real-world-asset claims, what the tiers mean,
                  and how to verify an attestation on-chain. Ask me anything about the network.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12.5px] text-white/75 transition-colors hover:border-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9296f5]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) =>
                m.role === "user" || m.role === "assistant" ? (
                  <Bubble key={m.id} role={m.role}>
                    {m.role === "assistant" ? (
                      <AssistantMessage message={m} />
                    ) : (
                      <span className="whitespace-pre-wrap">{m.content}</span>
                    )}
                  </Bubble>
                ) : null,
              )
            )}

            {/* Streaming indicator: shown while waiting for the first token. */}
            {status === "submitted" && (
              <div className="flex justify-start" aria-live="polite">
                <div className="rounded-[16px] rounded-bl-[4px] border border-white/10 bg-white/[0.05] px-3.5 py-3">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-[chat-dot_1s_infinite] rounded-full bg-white/50" />
                    <span className="h-1.5 w-1.5 animate-[chat-dot_1s_0.15s_infinite] rounded-full bg-white/50" />
                    <span className="h-1.5 w-1.5 animate-[chat-dot_1s_0.3s_infinite] rounded-full bg-white/50" />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={submit} className="border-t border-white/10 px-3 py-3">
            <div className="flex items-end gap-2 rounded-[16px] border border-white/10 bg-white/[0.04] px-3 py-2 focus-within:border-white/25">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={MAX_INPUT_CHARS}
                placeholder="Ask about Bombe..."
                aria-label="Message"
                // Suppress the global cobalt :focus-visible outline (the wrapper's
                // focus-within border is the affordance); inline beats the unlayered rule.
                style={{ outline: "none" }}
                className="max-h-28 min-h-[24px] flex-1 resize-none bg-transparent text-[14px] text-white placeholder:text-white/35 focus:outline-none"
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={() => stop()}
                  aria-label="Stop generating"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9296f5]"
                >
                  <span className="h-3 w-3 rounded-[2px] bg-white" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Send message"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#494fdf] text-white transition-all duration-150 hover:bg-[#4f55f1] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9296f5]"
                >
                  <SendIcon />
                </button>
              )}
            </div>
            <p className="mt-1.5 px-1 text-center text-[10.5px] text-white/35">
              Bombe can make mistakes. Verify on-chain at{" "}
              <Link href="/verify" className="text-[#9296f5] hover:text-white">
                /verify
              </Link>
              .
            </p>
          </form>
        </div>
      )}
    </>
  );
}
