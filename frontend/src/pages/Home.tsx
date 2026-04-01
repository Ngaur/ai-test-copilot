import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { getStatus, startSession } from "@/api/chat";
import ChatWindow from "@/components/Chat/ChatWindow";
import FileUpload from "@/components/FileUpload/FileUpload";
import GeneratedTestViewer from "@/components/GeneratedTest/GeneratedTestViewer";
import PlaywrightTestViewer from "@/components/GeneratedTest/PlaywrightTestViewer";
import ReviewPanel from "@/components/HumanReview/ReviewPanel";
import PlaywrightConfirmPanel from "@/components/GeneratedTest/PlaywrightConfirmPanel";
import ReportViewer from "@/components/Report/ReportViewer";
import Sidebar from "@/components/Sidebar/Sidebar";
import SessionViewer from "@/components/SessionViewer/SessionViewer";
import TestCaseTable from "@/components/TestCases/TestCaseTable";
import ContextUpload from "@/components/ContextUpload/ContextUpload";
import TestDataUpload from "@/components/TestDataUpload/TestDataUpload";
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

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle:                          "Idle",
  parsing:                       "Parsing file...",
  generating:                    "Generating tests...",
  awaiting_test_data_or_generate: "Upload test data or proceed",
  awaiting_review:               "Awaiting review",
  improving:                     "Improving...",
  generating_schema:             "Preparing schema...",
  awaiting_test_data:            "Needs test data",
  generating_automation:         "Generating automation...",
  awaiting_playwright_confirmation: "Awaiting confirmation",
  ready_to_execute:              "Ready to run",
  executing:                     "Running tests",
  done:                          "Complete",
  error:                         "Error",
};

const STATUS_DOT: Record<SessionStatus, string> = {
  idle:                          "bg-text-muted",
  parsing:                       "bg-accent animate-pulse",
  generating:                    "bg-accent animate-pulse",
  awaiting_test_data_or_generate: "bg-orange-400 animate-pulse",
  awaiting_review:               "bg-warning animate-pulse",
  improving:                     "bg-purple-400 animate-pulse",
  generating_schema:             "bg-purple-400 animate-pulse",
  awaiting_test_data:            "bg-orange-400 animate-pulse",
  generating_automation:         "bg-accent animate-pulse",
  awaiting_playwright_confirmation: "bg-purple-400 animate-pulse",
  ready_to_execute:              "bg-success",
  executing:                     "bg-green-400 animate-pulse",
  done:                          "bg-success",
  error:                         "bg-danger",
};

// Steps that mean the graph has finished (or paused for human input)
const TERMINAL_STEPS = new Set(["awaiting_test_data_or_generate", "awaiting_review", "awaiting_test_data", "awaiting_playwright_confirmation", "ready_to_execute", "done", "error"]);

// Human-readable progress messages shown in chat on step transitions
const STEP_PROGRESS: Partial<Record<string, string>> = {
  generating: "Indexing complete. Generating test cases with the LLM — this may take a minute with a local model...",
};

export default function Home() {
  const { session, setSession, updateStatus, updateThreadId, addMessage, isLoading, setLoading, setGenerationProgress, reset, viewingSession, setViewingSession } =
    useSessionStore();
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [showTestDataUpload, setShowTestDataUpload] = useState(false);
  const [rightTab, setRightTab] = useState<"manual" | "automated" | "playwright">("manual");
  // Spec uploaded but session not yet started — waiting for optional context docs
  const [pendingSession, setPendingSession] = useState<{ sessionId: string; filename: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setLoading(false);
  }, [setLoading]);

  const startPolling = useCallback(
    (threadId: string, sessionId: string, initialStep: string = "") => {
      // Stop any existing poll before starting a new one
      if (pollRef.current) clearInterval(pollRef.current);
      // initialStep lets callers skip over an already-seen terminal step so the
      // first poll does not falsely trigger stopPolling() or re-add an old message.
      let lastStep = initialStep;
      let lastMsg = "";

      pollRef.current = setInterval(async () => {
        try {
          const s = await getStatus(threadId, sessionId);
          updateStatus(s.status);

          const stepChanged = s.current_step && s.current_step !== lastStep;
          const msgChanged = s.last_message && s.last_message !== lastMsg;

          // During generating_automation: parse progress updates silently (no chat spam)
          if (s.current_step === "generating_automation" && msgChanged) {
            lastMsg = s.last_message;
            const progress = parseProgress(s.last_message);
            if (progress) {
              setGenerationProgress(progress);
            }
          }

          // On step transition: show AI message or a canned progress hint
          if (stepChanged) {
            const prev = lastStep;
            lastStep = s.current_step;
            lastMsg = s.last_message ?? "";

            if (s.current_step !== "generating_automation") {
              // Clear progress bar when leaving generation phase
              setGenerationProgress(null);

              if (s.last_message) {
                addMessage({ role: "assistant", content: s.last_message });
              } else if (prev !== "" && STEP_PROGRESS[s.current_step]) {
                addMessage({ role: "assistant", content: STEP_PROGRESS[s.current_step]! });
              }
            } else if (!parseProgress(s.last_message ?? "")) {
              // Entering generating_automation — show the kick-off message (not a progress line)
              if (s.last_message) {
                addMessage({ role: "assistant", content: s.last_message });
              }
            }

            if (TERMINAL_STEPS.has(s.current_step)) {
              stopPolling();
              if (s.current_step === "awaiting_review") {
                queryClient.invalidateQueries({ queryKey: ["test-cases", threadId] });
              }
              if (s.current_step === "ready_to_execute") {
                // Refresh sidebar history list now that artifacts are on disk
                queryClient.invalidateQueries({ queryKey: ["past-sessions"] });
                // Switch to Playwright tab if Playwright tests were generated, otherwise Feature Files
                if (s.last_message?.includes("Playwright test suite generated")) {
                  setRightTab("playwright");
                  queryClient.invalidateQueries({ queryKey: ["playwright-test", threadId] });
                } else {
                  setRightTab("automated");
                  queryClient.invalidateQueries({ queryKey: ["generated-test", threadId] });
                }
              }
            }
          }
        } catch {
          stopPolling();
        }
      }, 2500);
    },
    [updateStatus, addMessage, setGenerationProgress, queryClient, stopPolling],
  );

  // When status shifts to "improving" (triggered by ReviewPanel after feedback submission),
  // restart polling so the chat receives the updated test suite message when the LLM finishes.
  useEffect(() => {
    if (session?.status === "improving" && session.threadId && !pollRef.current) {
      setLoading(true);
      startPolling(session.threadId, session.sessionId);
    }
  }, [session?.status, session?.threadId, session?.sessionId, startPolling, setLoading]);

  // When status shifts to "generating_schema" (triggered by ReviewPanel after approval),
  // start polling so the chat receives the schema message when LLM calls finish.
  useEffect(() => {
    if (session?.status === "generating_schema" && session.threadId && !pollRef.current) {
      setLoading(true);
      startPolling(session.threadId, session.sessionId);
    }
  }, [session?.status, session?.threadId, session?.sessionId, startPolling, setLoading]);

  // When status shifts to "generating_automation" via ReviewPanel (early-data approval path),
  // start polling so progress messages and the final "ready_to_execute" arrive in chat.
  // Guard with !pollRef.current so we don't double-start when handleTestDataUploaded already
  // kicked off polling (the late-upload path always calls startPolling itself).
  useEffect(() => {
    if (session?.status === "generating_automation" && session.threadId && !pollRef.current) {
      setLoading(true);
      // Pass "generating_automation" as initialStep so the first poll (which will see
      // the same step still in state) is not treated as a new transition and does not
      // re-add the kick-off message that ReviewPanel already added to chat.
      startPolling(session.threadId, session.sessionId, "generating_automation");
    }
  }, [session?.status, session?.threadId, session?.sessionId, startPolling, setLoading]);

  // When status shifts to "executing" (triggered by ReportViewer after Run Tests click),
  // restart polling so chat receives live updates and "done" status when pytest finishes.
  useEffect(() => {
    if (session?.status === "executing" && session.threadId && !pollRef.current) {
      startPolling(session.threadId, session.sessionId);
    }
  }, [session?.status, session?.threadId, session?.sessionId, startPolling]);

  const handleUploaded = useCallback(
    async (sessionId: string, filename: string) => {
      setShowUpload(false);
      // Pause here — show the context doc upload step before starting the graph
      setPendingSession({ sessionId, filename });
      setSession({ sessionId, threadId: null, status: "idle", filename });
      addMessage({
        role: "assistant",
        content:
          `**${filename}** uploaded! ` +
          "Optionally add context documents (feature specs, workflow guides, README) to generate " +
          "more meaningful, business-aware test cases. Click **Start Analysis** when ready.",
      });
    },
    [setSession, addMessage],
  );

  const handleStartSession = useCallback(
    async () => {
      if (!pendingSession) return;
      const { sessionId, filename } = pendingSession;
      setPendingSession(null);
      setLoading(true);
      try {
        const res = await startSession(sessionId);
        updateThreadId(res.thread_id);
        setSession({ sessionId: res.session_id, threadId: res.thread_id, status: res.status, filename });
        addMessage({ role: "assistant", content: res.message });
        startPolling(res.thread_id, res.session_id);
      } catch {
        addMessage({ role: "assistant", content: "Failed to start session. Please try again." });
        setLoading(false);
      }
    },
    [pendingSession, setSession, updateThreadId, addMessage, setLoading, startPolling],
  );

  const handleTestDataUploaded = useCallback(
    (rowsLoaded: number, message: string) => {
      setShowTestDataUpload(false);
      addMessage({ role: "assistant", content: message });
      const isEarlyUpload = session?.status === "awaiting_test_data_or_generate";
      // Early upload → generates test cases next ("generating")
      // Late upload (post-approval) → generates feature files next ("generating_automation")
      updateStatus(isEarlyUpload ? "generating" : "generating_automation");
      setLoading(true);
      if (session?.threadId && session?.sessionId) {
        // Pass the current step as initialStep so the first poll doesn't treat the
        // still-visible terminal step as a new transition (which would re-add the old
        // schema message and immediately stop polling again).
        const knownStep = isEarlyUpload ? "awaiting_test_data_or_generate" : "awaiting_test_data";
        startPolling(session.threadId, session.sessionId, knownStep);
      }
    },
    [addMessage, updateStatus, setLoading, startPolling, session?.status, session?.threadId, session?.sessionId],
  );

  const handleFileUploadClick = useCallback(() => {
    if (session?.status === "awaiting_test_data" || session?.status === "awaiting_test_data_or_generate") {
      setShowTestDataUpload(true);
    } else {
      setShowUpload(true);
    }
  }, [session?.status]);

  const handleNewSession = () => {
    stopPolling();
    reset();             // also clears viewingSession (see store)
    setShowUpload(false);
    setShowTestDataUpload(false);
    setPendingSession(null);
    setRightTab("manual");
  };

  const handleSelectPastSession = useCallback(
    (past: PastSession) => {
      setViewingSession(past);
    },
    [setViewingSession],
  );

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Sidebar */}
      <Sidebar onNewSession={handleNewSession} onSelectPastSession={handleSelectPastSession} />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {viewingSession ? (
          /* ── Past session viewer — full width, independent of active session ── */
          <div className="flex-1 overflow-hidden bg-surface flex flex-col">
            <SessionViewer session={viewingSession} />
          </div>
        ) : !session ? (
          /* ── Welcome / Upload screen ── */
          <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8 animate-fade-in">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🧪</span>
              </div>
              <h1 className="text-2xl font-bold text-text-primary">AI Test Copilot</h1>
              <p className="text-text-secondary text-sm mt-2 max-w-md leading-relaxed">
                Upload a Postman collection or API spec to automatically generate
                comprehensive manual and automated test cases with human-in-the-loop review.
              </p>
            </div>
            <FileUpload onUploaded={handleUploaded} isLoading={isLoading} />
          </div>
        ) : (
          /* ── Active session: chat panel + right panel ── */
          <>
            {/* Chat panel */}
            <div className="w-[420px] flex-shrink-0 flex flex-col border-r border-border">
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[session.status]}`} />
                  <span className="text-text-primary text-sm font-medium truncate">{session.filename}</span>
                </div>
                <span className="text-xs text-text-muted flex-shrink-0">
                  {STATUS_LABEL[session.status]}
                </span>
              </div>

              <div className="flex-1 overflow-hidden">
                <ChatWindow onFileUploadClick={handleFileUploadClick} />
              </div>
              {pendingSession && (
                <ContextUpload
                  sessionId={pendingSession.sessionId}
                  specFilename={pendingSession.filename}
                  onStart={handleStartSession}
                />
              )}
              {!pendingSession && <ReviewPanel />}
              {!pendingSession && <PlaywrightConfirmPanel />}
              {!pendingSession && <ReportViewer />}
            </div>

            {/* Right panel: Manual tests / Automated code */}
            <div className="flex-1 overflow-hidden bg-surface flex flex-col">
              {/* Tab bar */}
              <div className="flex border-b border-border flex-shrink-0">
                <button
                  onClick={() => setRightTab("manual")}
                  className={`px-4 py-2.5 text-xs font-medium transition-colors ${
                    rightTab === "manual"
                      ? "text-accent border-b-2 border-accent -mb-px"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  Manual Test Cases
                </button>
                <button
                  onClick={() => setRightTab("automated")}
                  disabled={
                    session.status !== "ready_to_execute" &&
                    session.status !== "executing" &&
                    session.status !== "done"
                  }
                  className={`px-4 py-2.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    rightTab === "automated"
                      ? "text-accent border-b-2 border-accent -mb-px"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  Feature Files
                </button>
                <button
                  onClick={() => setRightTab("playwright")}
                  disabled={
                    session.status !== "ready_to_execute" &&
                    session.status !== "executing" &&
                    session.status !== "done"
                  }
                  className={`px-4 py-2.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    rightTab === "playwright"
                      ? "text-purple-400 border-b-2 border-purple-400 -mb-px"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  Playwright Tests
                </button>
              </div>

              <div className="flex-1 overflow-hidden">
                {rightTab === "manual" && <TestCaseTable />}
                {rightTab === "automated" && <GeneratedTestViewer />}
                {rightTab === "playwright" && <PlaywrightTestViewer />}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Upload modal (triggered from chat paperclip — for new API spec) */}
      {showUpload && (
        <FileUpload
          onUploaded={handleUploaded}
          isLoading={isLoading}
          compact
          onClose={() => setShowUpload(false)}
        />
      )}

      {/* Test data upload modal (triggered when status is awaiting_test_data or awaiting_test_data_or_generate) */}
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
