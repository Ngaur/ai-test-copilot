import { useState } from "react";
import { confirmPlaywright, skipPlaywright } from "@/api/chat";
import { useSessionStore } from "@/store/session";

export default function PlaywrightConfirmPanel() {
  const { session, updateStatus, addMessage } = useSessionStore();
  const [submitting, setSubmitting] = useState(false);

  if (session?.status !== "awaiting_playwright_confirmation") return null;

  const handleYes = async () => {
    if (!session.threadId) return;
    setSubmitting(true);
    try {
      const res = await confirmPlaywright(session.threadId);
      updateStatus(res.status);
      addMessage({ role: "assistant", content: res.message });
    } catch {
      addMessage({ role: "assistant", content: "Failed to start Playwright generation. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (!session.threadId) return;
    setSubmitting(true);
    try {
      const res = await skipPlaywright(session.threadId);
      updateStatus(res.status);
      addMessage({ role: "assistant", content: res.message });
    } catch {
      addMessage({ role: "assistant", content: "Failed to skip. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-4 py-3 border-t border-border flex-shrink-0 animate-slide-in">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse flex-shrink-0" />
        <span className="text-xs font-semibold text-text-primary">Generate Playwright Tests?</span>
      </div>
      <p className="text-xs text-text-secondary mb-3 leading-relaxed">
        Feature files are ready. Generate executable Playwright Python tests for automated execution.
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleYes}
          disabled={submitting}
          className="flex-1 bg-accent/10 border border-accent/30 text-accent text-xs font-medium px-3 py-2 rounded-lg hover:bg-accent/20 disabled:opacity-50 transition-colors"
        >
          Yes, Generate
        </button>
        <button
          onClick={handleSkip}
          disabled={submitting}
          className="flex-1 bg-surface border border-border text-text-secondary text-xs font-medium px-3 py-2 rounded-lg hover:text-text-primary disabled:opacity-50 transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
