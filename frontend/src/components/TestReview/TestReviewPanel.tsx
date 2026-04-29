import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Edit3,
  MessageSquare,
  Plus,
  Save,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { getTestCases, submitReview } from "@/api/chat";
import { useSessionStore } from "@/store/session";
import type { TestCase } from "@/types";

// ── Badge helpers ────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<string, string> = {
  "P1-Critical": "bg-danger",
  "P2-High": "bg-orange-500",
  "P3-Medium": "bg-warning",
  "P4-Low": "bg-text-muted",
};

const PRIORITY_STYLES: Record<string, string> = {
  "P1-Critical": "bg-danger/10 text-danger border-danger/30",
  "P2-High": "bg-orange-500/10 text-orange-500 border-orange-500/30",
  "P3-Medium": "bg-warning/10 text-warning border-warning/30",
  "P4-Low": "bg-text-muted/10 text-text-muted border-text-muted/30",
};

const TYPE_STYLES: Record<string, string> = {
  Functional: "bg-accent/10 text-accent border-accent/30",
  Negative: "bg-purple-500/10 text-purple-500 border-purple-500/30",
  "Edge Case": "bg-pink-500/10 text-pink-500 border-pink-500/30",
  Security: "bg-red-500/10 text-red-500 border-red-500/30",
  Performance: "bg-green-500/10 text-green-500 border-green-500/30",
};

const PRIORITIES = ["P1-Critical", "P2-High", "P3-Medium", "P4-Low"];
const ALL_TYPES = ["All", "Functional", "Negative", "Edge Case", "Security", "Performance"];

function Badge({ label, styles }: { label: string; styles: Record<string, string> }) {
  const cls = styles[label] ?? "bg-card text-text-muted border-border";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cls}`}>
      {label}
    </span>
  );
}

// ── Left panel — test case list ───────────────────────────────────────────────

interface ListProps {
  testCases: TestCase[];
  selected: TestCase | null;
  onSelect: (tc: TestCase) => void;
  onDelete: (id: string) => void;
  filter: string;
  onFilterChange: (f: string) => void;
  isEditing: boolean;
}

function TestCaseList({ testCases, selected, onSelect, onDelete, filter, onFilterChange, isEditing }: ListProps) {
  const visible = filter === "All" ? testCases : testCases.filter((tc) => tc.test_type === filter);

  return (
    <div className="flex flex-col h-full border-r border-border">
      <div className="px-4 py-3.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardList size={15} className="text-accent" />
          <span className="text-sm font-semibold text-text-primary">Test Cases</span>
          <span className="text-xs text-white bg-accent px-2 py-0.5 rounded-full font-medium ml-auto">
            {testCases.length}
          </span>
        </div>
        <div className="flex gap-1 text-[10px] text-text-muted flex-wrap">
          <span className="text-accent">{testCases.filter((t) => t.test_type === "Functional").length} func</span>
          <span>·</span>
          <span className="text-purple-500">{testCases.filter((t) => t.test_type === "Negative").length} neg</span>
          <span>·</span>
          <span className="text-pink-500">{testCases.filter((t) => t.test_type === "Edge Case").length} edge</span>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-border flex-shrink-0">
        <div className="relative">
          <select
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text-secondary appearance-none cursor-pointer focus:outline-none focus:border-accent/60"
          >
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>{t === "All" ? `All types (${testCases.length})` : t}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {visible.map((tc) => (
          <div
            key={tc.id}
            className={[
              "flex items-start gap-2 px-4 py-3 border-b border-border transition-colors group",
              selected?.id === tc.id ? "bg-accent/5 border-l-2 border-l-accent" : "hover:bg-card",
            ].join(" ")}
          >
            <button
              onClick={() => !isEditing && onSelect(tc)}
              className="flex items-start gap-3 flex-1 min-w-0 text-left"
            >
              <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${PRIORITY_DOT[tc.priority] ?? "bg-text-muted"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text-primary truncate">{tc.title}</p>
                <p className="text-[10px] text-text-muted font-mono mt-0.5 truncate">{tc.endpoint}</p>
              </div>
            </button>
            <button
              onClick={() => onDelete(tc.id)}
              disabled={isEditing}
              title="Delete test case"
              className="flex-shrink-0 p-1 rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-0"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────

interface EditFormProps {
  draft: TestCase;
  onChange: (updated: TestCase) => void;
  onSave: () => void;
  onCancel: () => void;
}

function TestCaseEditForm({ draft, onChange, onSave, onCancel }: EditFormProps) {
  const updateStep = (idx: number, field: "action" | "expected_result", val: string) => {
    const steps = draft.steps.map((s, i) =>
      i === idx ? { ...s, [field]: val } : s
    );
    onChange({ ...draft, steps });
  };

  const addStep = () => {
    const steps = [
      ...draft.steps,
      { step_number: draft.steps.length + 1, action: "", expected_result: "" },
    ];
    onChange({ ...draft, steps });
  };

  const removeStep = (idx: number) => {
    const steps = draft.steps
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, step_number: i + 1 }));
    onChange({ ...draft, steps });
  };

  const precsStr = draft.preconditions.join("\n");
  const setPrecs = (val: string) =>
    onChange({ ...draft, preconditions: val.split("\n").map((s) => s.trim()).filter(Boolean) });

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-5">

        {/* Title */}
        <div>
          <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Title</label>
          <input
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
            className="mt-1 w-full text-sm bg-surface border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent/60"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Priority</label>
          <div className="relative mt-1">
            <select
              value={draft.priority}
              onChange={(e) => onChange({ ...draft, priority: e.target.value })}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary appearance-none focus:outline-none focus:border-accent/60"
            >
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
        </div>

        {/* Preconditions */}
        <div>
          <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Preconditions <span className="normal-case font-normal">(one per line)</span></label>
          <textarea
            value={precsStr}
            onChange={(e) => setPrecs(e.target.value)}
            rows={3}
            className="mt-1 w-full text-sm bg-surface border border-border rounded-lg px-3 py-2 text-text-primary resize-none focus:outline-none focus:border-accent/60"
          />
        </div>

        {/* Steps */}
        <div>
          <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Steps</label>
          <div className="mt-2 space-y-3">
            {draft.steps.map((step, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center text-[10px] font-bold text-text-muted mt-1">
                  {step.step_number}
                </span>
                <div className="flex-1 space-y-1.5">
                  <input
                    value={step.action}
                    onChange={(e) => updateStep(idx, "action", e.target.value)}
                    placeholder="Action…"
                    className="w-full text-xs bg-surface border border-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:border-accent/60"
                  />
                  <input
                    value={step.expected_result}
                    onChange={(e) => updateStep(idx, "expected_result", e.target.value)}
                    placeholder="Expected result…"
                    className="w-full text-xs bg-success/5 border border-success/20 rounded-lg px-3 py-1.5 text-text-secondary focus:outline-none focus:border-success/40"
                  />
                </div>
                <button
                  onClick={() => removeStep(idx)}
                  className="flex-shrink-0 p-1 rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors mt-1"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <button
              onClick={addStep}
              className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              <Plus size={13} /> Add step
            </button>
          </div>
        </div>

        {/* Expected Result */}
        <div>
          <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Overall Expected Result</label>
          <textarea
            value={draft.expected_result}
            onChange={(e) => onChange({ ...draft, expected_result: e.target.value })}
            rows={3}
            className="mt-1 w-full text-sm bg-surface border border-border rounded-lg px-3 py-2 text-text-primary resize-none focus:outline-none focus:border-accent/60"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Notes</label>
          <textarea
            value={draft.notes ?? ""}
            onChange={(e) => onChange({ ...draft, notes: e.target.value })}
            rows={2}
            className="mt-1 w-full text-sm bg-surface border border-border rounded-lg px-3 py-2 text-text-primary resize-none focus:outline-none focus:border-accent/60"
          />
        </div>
      </div>

      <div className="border-t border-border bg-card px-6 py-4 flex-shrink-0 flex items-center gap-2">
        <button
          onClick={onSave}
          className="flex items-center gap-1.5 bg-accent text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-accent-hover transition-colors"
        >
          <Save size={14} /> Save changes
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-text-muted text-sm px-3 py-2 rounded-xl hover:text-text-secondary transition-colors"
        >
          <XCircle size={14} /> Cancel
        </button>
      </div>
    </div>
  );
}

// ── Right panel — detail + feedback ──────────────────────────────────────────

interface DetailProps {
  tc: TestCase;
  threadId: string;
  localTestCases: TestCase[];
  onStatusChange: (status: string) => void;
  onStartEdit: () => void;
}

function TestCaseDetail({ tc, threadId, localTestCases, onStatusChange, onStartEdit }: DetailProps) {
  const { addMessage, updateStatus } = useSessionStore();
  const [feedback, setFeedback] = useState("");
  const [mode, setMode] = useState<"idle" | "feedback">("idle");
  const [submitting, setSubmitting] = useState(false);

  const handleReview = async (approved: boolean) => {
    setSubmitting(true);
    if (!approved && feedback.trim()) {
      addMessage({ role: "user", content: feedback.trim() });
    }
    try {
      const res = await submitReview({
        thread_id: threadId,
        approved,
        feedback: approved ? undefined : feedback,
        test_cases: approved ? localTestCases : undefined,
      });
      addMessage({ role: "assistant", content: res.message });
      updateStatus(res.status);
      onStatusChange(res.status);
      setFeedback("");
      setMode("idle");
    } catch {
      addMessage({ role: "assistant", content: "Failed to submit review. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-5">
        {/* Title + badges + edit button */}
        <div>
          <div className="flex items-start gap-3">
            <h2 className="flex-1 text-base font-semibold text-text-primary">{tc.title}</h2>
            <button
              onClick={onStartEdit}
              title="Edit test case"
              className="flex-shrink-0 flex items-center gap-1 text-xs text-text-muted hover:text-accent border border-border hover:border-accent/40 px-2 py-1 rounded-lg transition-colors"
            >
              <Edit3 size={12} /> Edit
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge label={tc.test_type} styles={TYPE_STYLES} />
            <Badge label={tc.priority} styles={PRIORITY_STYLES} />
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono text-text-muted border border-border bg-surface">
              {tc.endpoint}
            </span>
          </div>
        </div>

        {tc.preconditions.length > 0 && (
          <section>
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Preconditions</p>
            <ul className="space-y-1">
              {tc.preconditions.map((p, i) => (
                <li key={i} className="flex gap-2 text-sm text-text-secondary">
                  <span className="text-text-muted mt-0.5">•</span>{p}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Steps</p>
          <ol className="space-y-3">
            {tc.steps.map((s) => (
              <li key={s.step_number} className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center text-[10px] font-bold text-text-muted">
                  {s.step_number}
                </span>
                <div className="flex-1">
                  <p className="text-sm text-text-primary">{s.action}</p>
                  <p className="text-xs text-success mt-0.5">↳ {s.expected_result}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Expected Result</p>
          <p className="text-sm text-text-secondary">{tc.expected_result}</p>
        </section>

        {tc.notes && (
          <section>
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Notes</p>
            <p className="text-sm text-text-muted italic">{tc.notes}</p>
          </section>
        )}
      </div>

      {/* Review footer */}
      <div className="border-t border-border bg-card px-6 py-4 flex-shrink-0">
        <p className="text-xs text-text-muted mb-3">
          Review and edit test cases above, then approve to proceed to automation or give feedback to improve.
        </p>

        {mode === "feedback" && (
          <textarea
            className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted mb-3 focus:outline-none focus:border-accent/60 resize-none"
            rows={3}
            placeholder="Describe what's missing or needs improvement…"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            autoFocus
          />
        )}

        <div className="flex gap-2">
          <button
            onClick={() => handleReview(true)}
            disabled={submitting}
            className="flex items-center gap-1.5 bg-success/10 border border-success/30 text-success text-sm font-medium px-4 py-2 rounded-xl hover:bg-success/20 disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 size={15} />
            Approve & Proceed
          </button>

          {mode === "idle" ? (
            <button
              onClick={() => setMode("feedback")}
              disabled={submitting}
              className="flex items-center gap-1.5 bg-warning/10 border border-warning/30 text-warning text-sm font-medium px-4 py-2 rounded-xl hover:bg-warning/20 disabled:opacity-50 transition-colors"
            >
              <MessageSquare size={15} />
              Request Refinement
            </button>
          ) : (
            <>
              <button
                onClick={() => handleReview(false)}
                disabled={submitting || !feedback.trim()}
                className="flex items-center gap-1.5 bg-warning/10 border border-warning/30 text-warning text-sm font-medium px-4 py-2 rounded-xl hover:bg-warning/20 disabled:opacity-50 transition-colors"
              >
                <MessageSquare size={15} />
                Submit Feedback
              </button>
              <button
                onClick={() => { setMode("idle"); setFeedback(""); }}
                className="flex items-center gap-1.5 text-text-muted text-sm px-3 py-2 rounded-xl hover:text-text-secondary transition-colors"
              >
                <XCircle size={15} />
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  threadId: string;
  onStatusChange: (status: string) => void;
}

export default function TestReviewPanel({ threadId, onStatusChange }: Props) {
  const [localTestCases, setLocalTestCases] = useState<TestCase[]>([]);
  const [selected, setSelected] = useState<TestCase | null>(null);
  const [filter, setFilter] = useState("All");
  const [editDraft, setEditDraft] = useState<TestCase | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["test-cases", threadId],
    queryFn: () => getTestCases(threadId),
  });

  useEffect(() => {
    if (data?.test_cases && localTestCases.length === 0) {
      setLocalTestCases(data.test_cases);
      setSelected(data.test_cases[0] ?? null);
    }
  }, [data?.test_cases, localTestCases.length]);

  const handleDelete = (id: string) => {
    setLocalTestCases((prev) => {
      const next = prev.filter((tc) => tc.id !== id);
      if (selected?.id === id) {
        const idx = prev.findIndex((tc) => tc.id === id);
        setSelected(next[Math.min(idx, next.length - 1)] ?? null);
      }
      return next;
    });
    if (editDraft?.id === id) setEditDraft(null);
  };

  const handleSelect = (tc: TestCase) => {
    if (editDraft) return;
    setSelected(tc);
  };

  const handleStartEdit = () => {
    if (!selected) return;
    setEditDraft({ ...selected });
  };

  const handleSaveEdit = () => {
    if (!editDraft) return;
    setLocalTestCases((prev) => prev.map((tc) => (tc.id === editDraft.id ? editDraft : tc)));
    setSelected(editDraft);
    setEditDraft(null);
  };

  const handleCancelEdit = () => setEditDraft(null);

  if (isLoading || (localTestCases.length === 0 && !data)) {
    return (
      <div className="flex flex-1 items-center justify-center bg-surface">
        <div className="flex gap-1.5">
          {[0, 150, 300].map((d) => (
            <span
              key={d}
              className="w-2 h-2 bg-text-muted rounded-full animate-bounce"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden bg-surface">
      {/* Left — list */}
      <div className="w-72 flex-shrink-0 overflow-hidden flex flex-col">
        <TestCaseList
          testCases={localTestCases}
          selected={editDraft ? (localTestCases.find((tc) => tc.id === editDraft.id) ?? null) : selected}
          onSelect={handleSelect}
          onDelete={handleDelete}
          filter={filter}
          onFilterChange={setFilter}
          isEditing={!!editDraft}
        />
      </div>

      {/* Right — edit form or detail */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {editDraft ? (
          <TestCaseEditForm
            draft={editDraft}
            onChange={setEditDraft}
            onSave={handleSaveEdit}
            onCancel={handleCancelEdit}
          />
        ) : selected ? (
          <TestCaseDetail
            tc={selected}
            threadId={threadId}
            localTestCases={localTestCases}
            onStatusChange={onStatusChange}
            onStartEdit={handleStartEdit}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-text-muted text-sm">
            Select a test case to view details
          </div>
        )}
      </div>
    </div>
  );
}
