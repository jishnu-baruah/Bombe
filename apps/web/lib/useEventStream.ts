"use client";

// Import via alias — browser-safe (avoids Node-only @bombe/shared barrel). See next.config.ts.
import type { AgentDoneEvent, AgentStepEvent, ClaimPostedEvent, SseEvent } from "@bombe-events";
import { useEffect, useReducer, useRef } from "react";
import { parseEvent } from "./parseEvent";

export interface StreamState {
  connected: boolean;
  events: SseEvent[];
  claims: ClaimPostedEvent[];
  agentDone: AgentDoneEvent[];
  agentSteps: AgentStepEvent[];
  error: string | null;
}

type StreamAction =
  | { type: "connected" }
  | { type: "event"; event: SseEvent }
  | { type: "error"; error: string }
  | { type: "disconnected" };

function reducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case "connected":
      return { ...state, connected: true, error: null };
    case "disconnected":
      return { ...state, connected: false };
    case "error":
      return { ...state, error: action.error, connected: false };
    case "event": {
      const { event } = action;
      const next: StreamState = { ...state, events: [...state.events, event] };
      if (event.kind === "CLAIM_POSTED") {
        next.claims = [...state.claims, event];
      } else if (event.kind === "AGENT_DONE") {
        next.agentDone = [...state.agentDone, event];
      } else if (event.kind === "AGENT_STEP") {
        next.agentSteps = [...state.agentSteps, event];
      }
      return next;
    }
    default:
      return state;
  }
}

const initialState: StreamState = {
  connected: false,
  events: [],
  claims: [],
  agentDone: [],
  agentSteps: [],
  error: null,
};

/**
 * Client hook: connects to /api/stream via EventSource, parses SseEvent
 * objects using parseEvent(), and routes by `kind` into typed state buckets.
 * No `any`. (PRD §6.5, §6.6)
 */
export function useEventStream(url = "/api/stream"): StreamState {
  const [state, dispatch] = useReducer(reducer, initialState);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => dispatch({ type: "connected" });

    es.onmessage = (e: MessageEvent<string>) => {
      const result = parseEvent(e.data);
      if (result.ok) {
        dispatch({ type: "event", event: result.event });
      } else {
        // Warn but don't crash — bad events are dropped, not thrown
        console.warn("[useEventStream] parse error:", result.error);
      }
    };

    es.onerror = () => {
      dispatch({ type: "error", error: "SSE connection error" });
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
      dispatch({ type: "disconnected" });
    };
  }, [url]);

  return state;
}
