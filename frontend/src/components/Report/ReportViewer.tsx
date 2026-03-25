import { ExternalLink, PlayCircle } from "lucide-react";
import { executeTests } from "@/api/chat";
import { useSessionStore } from "@/store/session";

export default function ReportViewer() {
  const { session, addMessage, updateStatus } = useSessionStore();

  const showPanel =
    session?.status === "ready_to_execute" ||
    session?.status === "generating_automation" ||
    session?.status === "executing" ||
    session?.status === "done";

  if (!showPanel) return null;

  const isRunning = session?.status === "executing";
  const isDone = session?.status === "done";

  const handleRun = async () => {
    if (!session?.threadId || isRunning) return;
    try {
      await executeTests(session.threadId);
      // Backend immediately updates state to "executing" and adds a chat message.
      // Update local status so the "improving" watcher in Home.tsx restarts polling.
      updateStatus("executing");
      addMessage({ role: "assistant", content: "▶ Running automated tests — check back shortly for results." });
    } catch {
      addMessage({ role: "assistant", content: "Failed to start test execution. Please try again." });
    }
  };

  return (
    <div className="mx-4 mb-3 rounded-xl border border-border bg-card p-3.5 animate-slide-in">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">Automated Tests</p>
        <div className="flex gap-2">
          {!isDone && (
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="flex items-center gap-1.5 bg-accent/10 border border-accent/30 text-accent text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-accent/20 disabled:opacity-50 transition-colors"
            >
              <PlayCircle size={14} />
              {isRunning ? "Running..." : "Run Tests"}
            </button>
          )}
          {isDone && (
            <a
              href="http://localhost:8000/api/v1/report/view/index.html"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 bg-success/10 border border-success/30 text-success text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-success/20 transition-colors"
            >
              <ExternalLink size={14} />
              View Report
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
