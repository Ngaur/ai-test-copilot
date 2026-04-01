import { create } from "zustand";
import type { ChatMessage, PastSession, Session, SessionStatus, TestCase } from "@/types";

export interface GenerationProgress {
  current: number;
  total: number;
  currentTitle: string;
  phase: "gherkin" | "playwright";
}

interface SessionStore {
  session: Session | null;
  messages: ChatMessage[];
  testCases: TestCase[];
  isLoading: boolean;
  generationProgress: GenerationProgress | null;
  // Session history — persists across active-session resets
  viewingSession: PastSession | null;

  setSession: (s: Session) => void;
  updateStatus: (status: SessionStatus) => void;
  updateThreadId: (threadId: string) => void;
  addMessage: (msg: Omit<ChatMessage, "timestamp">) => void;
  setTestCases: (tcs: TestCase[]) => void;
  setLoading: (v: boolean) => void;
  setGenerationProgress: (p: GenerationProgress | null) => void;
  setViewingSession: (s: PastSession | null) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  session: null,
  messages: [],
  testCases: [],
  isLoading: false,
  generationProgress: null,
  viewingSession: null,

  setSession: (s) => set({ session: s }),
  updateStatus: (status) =>
    set((state) => ({
      session: state.session ? { ...state.session, status } : null,
    })),
  updateThreadId: (threadId) =>
    set((state) => ({
      session: state.session ? { ...state.session, threadId } : null,
    })),
  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, { ...msg, timestamp: Date.now() }],
    })),
  setTestCases: (tcs) => set({ testCases: tcs }),
  setLoading: (v) => set({ isLoading: v }),
  setGenerationProgress: (p) => set({ generationProgress: p }),
  setViewingSession: (viewingSession) => set({ viewingSession }),
  // reset clears the active session but NOT viewingSession (history survives new-session clicks)
  reset: () =>
    set({ session: null, messages: [], testCases: [], isLoading: false, generationProgress: null, viewingSession: null }),
}));
