import { CheckCircle2, MessageSquare, XCircle } from "lucide-react";
import { useState } from "react";
import { submitReview } from "@/api/chat";
import { useSessionStore } from "@/store/session";

export default function ReviewPanel() {
  const { session, addMessage, updateStatus } = useSessionStore();
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"idle" | "feedback">("idle");

  if (session?.status !== "awaiting_review") return null;

  const handleReview = async (approved: boolean) => {
    if (!session?.threadId) return;
    setSubmitting(true);

    // Show the user's own feedback in chat immediately before the request goes out
    if (!approved && feedback.trim()) {
      addMessage({ role: "user", content: feedback.trim() });
    }

    try {
      const res = await submitReview({
        thread_id: session.threadId,
        approved,
        feedback: approved ? undefined : feedback,
      });
      addMessage({ role: "assistant", content: res.message });
      updateStatus(res.status);
      setFeedback("");
      setMode("idle");
    } catch {
      addMessage({ role: "assistant", content: "Failed to submit review. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-4 mb-3 rounded-xl border border-review-border bg-review-bg p-3.5 animate-slide-in">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
        <p className="text-sm font-semibold text-warning">Human Review Required</p>
      </div>
      <p className="text-xs text-text-secondary mb-3 leading-relaxed">
        Review the test cases in the right panel. Approve to proceed to automation, or provide feedback to improve them.
      </p>

      {mode === "feedback" && (
        <textarea
          className="w-full bg-[#1a1300] border border-review-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted mb-3 focus:outline-none focus:border-warning/60 resize-none"
          rows={3}
          placeholder="Describe what's missing or needs improvement..."
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          autoFocus
        />
      )}

      <div className="flex gap-2">
        <button
          onClick={() => handleReview(true)}
          disabled={submitting}
          className="flex items-center gap-1.5 bg-success/10 border border-success/30 text-success text-xs font-medium px-3 py-2 rounded-lg hover:bg-success/20 disabled:opacity-50 transition-colors"
        >
          <CheckCircle2 size={14} />
          Approve
        </button>

        {mode === "idle" ? (
          <button
            onClick={() => setMode("feedback")}
            disabled={submitting}
            className="flex items-center gap-1.5 bg-warning/10 border border-warning/30 text-warning text-xs font-medium px-3 py-2 rounded-lg hover:bg-warning/20 disabled:opacity-50 transition-colors"
          >
            <MessageSquare size={14} />
            Give Feedback
          </button>
        ) : (
          <>
            <button
              onClick={() => handleReview(false)}
              disabled={submitting || !feedback.trim()}
              className="flex items-center gap-1.5 bg-warning/10 border border-warning/30 text-warning text-xs font-medium px-3 py-2 rounded-lg hover:bg-warning/20 disabled:opacity-50 transition-colors"
            >
              <MessageSquare size={14} />
              Submit Feedback
            </button>
            <button
              onClick={() => setMode("idle")}
              className="flex items-center gap-1.5 text-text-muted text-xs px-3 py-2 rounded-lg hover:text-text-secondary transition-colors"
            >
              <XCircle size={14} />
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
