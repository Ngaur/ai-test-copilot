import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { confirmPlaywright, getStatus, skipPlaywright } from "@/api/chat";
import EarlyTestDataScreen from "@/components/EarlyTestData/EarlyTestDataScreen";
import LoadTestConfigScreen from "@/components/LoadTest/LoadTestConfigScreen";
import ProcessingScreen from "@/components/ProcessingScreen/ProcessingScreen";
import QuestionnairePanel from "@/components/Questionnaire/QuestionnairePanel";
import ResultsPanel from "@/components/Results/ResultsPanel";
import Sidebar from "@/components/Sidebar/Sidebar";
import SessionViewer from "@/components/SessionViewer/SessionViewer";
import TestDataUpload from "@/components/TestDataUpload/TestDataUpload";
import TestReviewPanel from "@/components/TestReview/TestReviewPanel";
import UploadScreen from "@/components/UploadScreen/UploadScreen";
import { useSessionStore } from "@/store/session";
import type { PastSession, SessionStatus } from "@/types";

// Parses "**3/15** — Generated: *Add user*" → gherkin phase progress
// Parses "**3/15** — Playwright: *Add user*" → playwright phase progress
const GHERKIN_PROGRESS_RE = /\*\*(\d+)\/(\d+)\*\*\s*[—–-]\s*Generated:\s*\*(.*?)\*/u;
const PLAYWRIGHT_PROGRESS_RE = /\*\*(\d+)\/(\d+)\*\*\s*[—–-]\s*Playwright:\s*\*(.*?)\*/u;
function parseProgress(msg: string) {
  const gm = msg.match(GHERKIN_PROGRESS_RE);
  if (gm) return { current: parseInt(gm[1], 10), total: parseInt(gm[2], 10), currentTitle: gm[3], phase: "gherkin" as const };
  const pm = msg.match(PLAYWRIGHT_PROGRESS_RE);
  if (pm) return { current: parseInt(pm[1], 10), total: parseInt(pm[2], 10), currentTitle: pm[3], phase: "playwright" as const };
  return null;
}

// Steps that mean the graph has finished (or paused for human input)
const TERMINAL_STEPS = new Set<SessionStatus>([
  "awaiting_questionnaire",
  "awaiting_test_data_or_generate",
  "awaiting_review",
  "awaiting_test_data",
  "awaiting_playwright_confirmation",
  "awaiting_load_test_config",
  "ready_to_execute",
  "done",
  "error",
]);

// Human-readable progress messages shown on step transitions
const STEP_PROGRESS: Partial<Record<string, string>> = {
  generating: "Indexing complete. Generating test cases with the LLM — this may take a minute with a local model...",
};

// ── Playwright confirmation screen ─────────────────────────────────────────

function PlaywrightConfirmScreen({ threadId }: { threadId: string }) {
  const { addMessage, updateStatus } = useSessionStore();
  const [submitting, setSubmitting] = useState(false);

  const handleYes = async () => {
    setSubmitting(true);
    try {
      const res = await confirmPlaywright(threadId);
      updateStatus(res.status);
      addMessage({ role: "assistant", content: res.message });
    } catch {
      addMessage({ role: "assistant", content: "Failed to start Playwright generation. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setSubmitting(true);
    try {
      const res = await skipPlaywright(threadId);
      updateStatus(res.status);
      addMessage({ role: "assistant", content: res.message });
    } catch {
      addMessage({ role: "assistant", content: "Failed to skip. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center bg-surface">
      <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full shadow-sm text-center space-y-5">
        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
          <span className="text-2xl">⚡</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Generate Playwright Tests?</h2>
          <p className="text-sm text-text-secondary mt-2 leading-relaxed">
            Feature files are ready. Generate executable Playwright Python tests for full automated execution.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleYes}
            disabled={submitting}
            className="flex-1 bg-accent hover:bg-accent-hover text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50 transition-colors shadow-sm"
          >
            Yes, Generate
          </button>
          <button
            onClick={handleSkip}
            disabled={submitting}
            className="flex-1 bg-surface border border-border text-text-secondary text-sm font-medium py-2.5 rounded-xl hover:text-text-primary disabled:opacity-50 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Home ────────────────────────────────────────────────────────────────────

export default function Home() {
  const {
    session,
    messages,
    setSession,
    updateStatus,
    updateThreadId,
    addMessage,
    setLoading,
    setGenerationProgress,
    setQuestionnaireQuestions,
    reset,
    viewingSession,
    setViewingSession,
  } = useSessionStore();

  const queryClient = useQueryClient();
  const [showTestDataUpload, setShowTestDataUpload] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-open test data modal when status reaches the upload pause (after review approval)
  useEffect(() => {
    if (session?.status === "awaiting_test_data") {
      setShowTestDataUpload(true);
    }
  }, [session?.status]);

  // Clean up polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setLoading(false);
  }, [setLoading]);

  const startPolling = useCallback(
    (threadId: string, sessionId: string, initialStep: string = "") => {
      if (pollRef.current) clearInterval(pollRef.current);
      let lastStep = initialStep;
      let lastMsg = "";

      pollRef.current = setInterval(async () => {
        try {
          const s = await getStatus(threadId, sessionId);

          if (s.questionnaire_questions && s.questionnaire_questions.length > 0) {
            setQuestionnaireQuestions(s.questionnaire_questions);
          }

          const stepChanged = s.current_step && s.current_step !== lastStep;
          const msgChanged = s.last_message && s.last_message !== lastMsg;

          if (s.current_step === "generating_automation" && msgChanged) {
            lastMsg = s.last_message;
            const progress = parseProgress(s.last_message);
            if (progress) setGenerationProgress(progress);
          }

          if (stepChanged) {
            updateStatus(s.status);
            const prev = lastStep;
            lastStep = s.current_step;
            lastMsg = s.last_message ?? "";

            if (s.current_step !== "generating_automation") {
              setGenerationProgress(null);
              if (s.last_message) {
                addMessage({ role: "assistant", content: s.last_message });
              } else if (prev !== "" && STEP_PROGRESS[s.current_step]) {
                addMessage({ role: "assistant", content: STEP_PROGRESS[s.current_step]! });
              }
            } else if (!parseProgress(s.last_message ?? "")) {
              if (s.last_message) addMessage({ role: "assistant", content: s.last_message });
            }

            if (TERMINAL_STEPS.has(s.current_step as SessionStatus)) {
              stopPolling();
              if (s.current_step === "awaiting_review") {
                queryClient.invalidateQueries({ queryKey: ["test-cases", threadId] });
              }
              if (s.current_step === "ready_to_execute") {
                queryClient.invalidateQueries({ queryKey: ["past-sessions"] });
                queryClient.invalidateQueries({ queryKey: ["generated-test", threadId] });
                queryClient.invalidateQueries({ queryKey: ["playwright-test", threadId] });
              }
            }
          }
        } catch {
          stopPolling();
        }
      }, 2500);
    },
    [updateStatus, addMessage, setGenerationProgress, setQuestionnaireQuestions, queryClient, stopPolling],
  );

  // Restart polling when status transitions happen triggered by child components
  useEffect(() => {
    if (session?.status === "improving" && session.threadId && !pollRef.current) {
      setLoading(true);
      startPolling(session.threadId, session.sessionId);
    }
  }, [session?.status, session?.threadId, session?.sessionId, startPolling, setLoading]);

  useEffect(() => {
    if (session?.status === "generating_schema" && session.threadId && !pollRef.current) {
      setLoading(true);
      startPolling(session.threadId, session.sessionId);
    }
  }, [session?.status, session?.threadId, session?.sessionId, startPolling, setLoading]);

  useEffect(() => {
    if (session?.status === "generating_automation" && session.threadId && !pollRef.current) {
      setLoading(true);
      startPolling(session.threadId, session.sessionId, "generating_automation");
    }
  }, [session?.status, session?.threadId, session?.sessionId, startPolling, setLoading]);

  useEffect(() => {
    if (session?.status === "executing" && session.threadId && !pollRef.current) {
      startPolling(session.threadId, session.sessionId);
    }
  }, [session?.status, session?.threadId, session?.sessionId, startPolling]);

  // Called by UploadScreen after it has uploaded spec + context + started session
  const handleStarted = useCallback(
    (sessionId: string, filename: string, threadId: string) => {
      setSession({ sessionId, threadId, status: "parsing", filename });
      updateThreadId(threadId);
      setLoading(true);
      startPolling(threadId, sessionId);
    },
    [setSession, updateThreadId, setLoading, startPolling],
  );

  const handleTestDataUploaded = useCallback(
    (_rowsLoaded: number, message: string) => {
      setShowTestDataUpload(false);
      addMessage({ role: "assistant", content: message });
      const isEarlyUpload = session?.status === "awaiting_test_data_or_generate";
      updateStatus(isEarlyUpload ? "generating" : "generating_automation");
      setLoading(true);
      if (session?.threadId && session?.sessionId) {
        const knownStep = isEarlyUpload ? "awaiting_test_data_or_generate" : "awaiting_test_data";
        startPolling(session.threadId, session.sessionId, knownStep);
      }
    },
    [addMessage, updateStatus, setLoading, startPolling, session?.status, session?.threadId, session?.sessionId],
  );

  const handleQuestionnaireSubmitted = useCallback(() => {
    if (!session?.threadId || !session?.sessionId) return;
    // Backend now returns awaiting_test_data_or_generate; poll once to pick up the status
    setLoading(true);
    startPolling(session.threadId, session.sessionId, "awaiting_questionnaire");
  }, [session?.threadId, session?.sessionId, setLoading, startPolling]);

  const handleEarlyDataSkipped = useCallback(() => {
    if (!session?.threadId || !session?.sessionId) return;
    updateStatus("generating");
    setLoading(true);
    startPolling(session.threadId, session.sessionId, "awaiting_test_data_or_generate");
  }, [session?.threadId, session?.sessionId, updateStatus, setLoading, startPolling]);

  const handleEarlyDataUploaded = useCallback(
    (_rowsLoaded: number, message: string) => {
      if (!session?.threadId || !session?.sessionId) return;
      addMessage({ role: "assistant", content: message });
      updateStatus("generating");
      setLoading(true);
      startPolling(session.threadId, session.sessionId, "awaiting_test_data_or_generate");
    },
    [session?.threadId, session?.sessionId, addMessage, updateStatus, setLoading, startPolling],
  );

  const handleReviewStatusChange = useCallback(
    (status: string) => {
      updateStatus(status as SessionStatus);
    },
    [updateStatus],
  );

  const handleNewSession = () => {
    stopPolling();
    reset();
    setShowTestDataUpload(false);
  };

  const handleSelectPastSession = useCallback(
    (past: PastSession) => setViewingSession(past),
    [setViewingSession],
  );

  // ── Determine which screen to render ──────────────────────────────────────

  const status = session?.status;

  const isProcessing =
    status === "parsing" ||
    status === "generating" ||
    status === "improving" ||
    status === "generating_schema" ||
    status === "generating_automation" ||
    status === "awaiting_test_data";

  const isResults =
    status === "ready_to_execute" ||
    status === "executing" ||
    status === "done";

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Sidebar — always visible */}
      <Sidebar onNewSession={handleNewSession} onSelectPastSession={handleSelectPastSession} />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {viewingSession ? (
          /* ── Past session viewer ── */
          <div className="flex-1 overflow-hidden flex flex-col">
            <SessionViewer session={viewingSession} />
          </div>

        ) : !session ? (
          /* ── Upload screen ── */
          <UploadScreen onStarted={handleStarted} />

        ) : isProcessing ? (
          /* ── Processing / step indicator ── */
          <ProcessingScreen
            filename={session.filename}
            status={session.status}
            messages={messages}
          />

        ) : status === "awaiting_questionnaire" && session.threadId ? (
          /* ── Intake questionnaire ── */
          <div className="flex flex-1 overflow-hidden">
            <QuestionnairePanel
              threadId={session.threadId}
              onSubmitted={handleQuestionnaireSubmitted}
            />
          </div>

        ) : status === "awaiting_test_data_or_generate" && session.threadId ? (
          /* ── Optional early test data upload ── */
          <EarlyTestDataScreen
            threadId={session.threadId}
            onSkipped={handleEarlyDataSkipped}
            onUploaded={handleEarlyDataUploaded}
          />

        ) : status === "awaiting_review" && session.threadId ? (
          /* ── Human review of test cases ── */
          <TestReviewPanel
            threadId={session.threadId}
            onStatusChange={handleReviewStatusChange}
          />

        ) : status === "awaiting_playwright_confirmation" && session.threadId ? (
          /* ── Playwright confirmation ── */
          <PlaywrightConfirmScreen threadId={session.threadId} />

        ) : status === "awaiting_load_test_config" && session.threadId ? (
          /* ── Load test script creation ── */
          <LoadTestConfigScreen
            threadId={session.threadId}
            onDone={() => updateStatus("ready_to_execute")}
          />

        ) : isResults && session.threadId ? (
          /* ── Results: test cases + feature files + playwright ── */
          <ResultsPanel
            threadId={session.threadId}
            status={session.status}
          />

        ) : status === "error" ? (
          /* ── Error state ── */
          <div className="flex flex-1 items-center justify-center bg-surface">
            <div className="text-center space-y-3">
              <div className="text-3xl">⚠️</div>
              <p className="text-text-primary font-semibold">Something went wrong</p>
              <p className="text-text-muted text-sm max-w-xs">
                An error occurred during processing. Start a new session to try again.
              </p>
              <button
                onClick={handleNewSession}
                className="mt-2 bg-accent text-white text-sm font-medium px-5 py-2 rounded-xl hover:bg-accent-hover transition-colors"
              >
                New Session
              </button>
            </div>
          </div>

        ) : null}
      </div>

      {/* Test data upload modal (auto-opened on relevant status) */}
      {showTestDataUpload && session?.threadId && (
        <TestDataUpload
          threadId={session.threadId}
          onUploaded={handleTestDataUploaded}
          onClose={() => setShowTestDataUpload(false)}
          isEarly={session.status === "awaiting_test_data_or_generate"}
        />
      )}
    </div>
  );
}
