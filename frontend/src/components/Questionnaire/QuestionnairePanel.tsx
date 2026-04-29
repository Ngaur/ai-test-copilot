import { useState } from "react";
import {
  CheckCircle2,
  HelpCircle,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { submitQuestionnaire } from "@/api/chat";
import { useSessionStore } from "@/store/session";
import type { QuestionnaireQuestion } from "@/types";

interface Props {
  threadId: string;
  onSubmitted: () => void;
}

// ── Dynamic field renderers ──────────────────────────────────────────────────

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || "Type your answer…"}
      className="w-full text-xs bg-surface border border-border rounded-lg px-3 py-1.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 transition-colors"
    />
  );
}

function TextareaInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      placeholder={placeholder || "Type your answer…"}
      className="w-full text-xs bg-surface border border-border rounded-lg px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 resize-none"
    />
  );
}

function SelectInput({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {options.map((opt) => (
        <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            checked={value === opt}
            onChange={() => onChange(opt)}
            className="accent-accent"
          />
          <span className="text-xs text-text-primary">{opt}</span>
        </label>
      ))}
    </div>
  );
}

function MultiSelectInput({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) => {
    if (value.includes(opt)) onChange(value.filter((x) => x !== opt));
    else onChange([...value, opt]);
  };
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {options.map((opt) => (
        <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={value.includes(opt)}
            onChange={() => toggle(opt)}
            className="accent-accent"
          />
          <span className="text-xs text-text-primary">{opt}</span>
        </label>
      ))}
    </div>
  );
}

function ChipFreeInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setInput("");
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {value.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 bg-accent/10 text-accent text-[11px] font-medium px-2 py-0.5 rounded-full"
          >
            {c}
            <button onClick={() => onChange(value.filter((x) => x !== c))} className="hover:text-danger transition-colors">
              <X size={10} />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add value…"
            className="text-[11px] text-text-primary bg-transparent border-none outline-none placeholder-text-muted w-24"
          />
        </div>
      </div>
    </div>
  );
}

// ── Question card ────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  value,
  onChange,
  isSkipped,
  onToggleSkip,
}: {
  question: QuestionnaireQuestion;
  value: string | string[];
  onChange: (v: string | string[]) => void;
  isSkipped: boolean;
  onToggleSkip: () => void;
}) {
  const isAnswered =
    !isSkipped && (typeof value === "string" ? value.trim().length > 0 : value.length > 0);

  return (
    <div
      className={[
        "rounded-xl border p-4 space-y-3 transition-all",
        isSkipped
          ? "border-border bg-surface opacity-60"
          : isAnswered
          ? "border-success/30 bg-success/5 border-l-4 border-l-success"
          : "border-border bg-card",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 mt-0.5">
          {isSkipped ? (
            <X size={14} className="text-text-muted" />
          ) : isAnswered ? (
            <CheckCircle2 size={14} className="text-success" />
          ) : (
            <HelpCircle size={14} className="text-text-muted" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={[
            "text-xs font-medium leading-relaxed",
            isSkipped ? "text-text-muted line-through" : "text-text-primary",
          ].join(" ")}>
            {question.question}
          </p>
          {question.hint && !isSkipped && (
            <p className="text-[11px] text-text-muted mt-0.5">{question.hint}</p>
          )}
        </div>
        {isSkipped ? (
          <button
            onClick={onToggleSkip}
            className="flex-shrink-0 text-[11px] text-accent hover:text-accent-hover transition-colors px-1.5 py-0.5 rounded"
          >
            Undo
          </button>
        ) : (
          <button
            onClick={onToggleSkip}
            className="flex-shrink-0 text-[11px] text-text-muted hover:text-text-secondary transition-colors px-1.5 py-0.5 rounded hover:bg-surface"
          >
            Skip
          </button>
        )}
      </div>

      {!isSkipped && (
        <div className="ml-5">
          {question.type === "text" && (
            <TextInput
              value={typeof value === "string" ? value : ""}
              onChange={(v) => onChange(v)}
            />
          )}
          {question.type === "textarea" && (
            <TextareaInput
              value={typeof value === "string" ? value : ""}
              onChange={(v) => onChange(v)}
            />
          )}
          {question.type === "select" && (
            <SelectInput
              options={question.options ?? []}
              value={typeof value === "string" ? value : ""}
              onChange={(v) => onChange(v)}
            />
          )}
          {question.type === "multi_select" && (
            question.options && question.options.length > 0 ? (
              <MultiSelectInput
                options={question.options}
                value={Array.isArray(value) ? value : []}
                onChange={(v) => onChange(v)}
              />
            ) : (
              <ChipFreeInput
                value={Array.isArray(value) ? value : []}
                onChange={(v) => onChange(v)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

// ── Fallback static questions ────────────────────────────────────────────────

const FALLBACK_QUESTIONS: QuestionnaireQuestion[] = [
  {
    id: "fb_error_codes",
    question: "What HTTP status codes does this API return for validation errors, auth failures, and not-found cases?",
    type: "textarea",
    hint: "e.g. 422 for validation, 401 for auth, 404 for missing resources",
    category: "error_codes",
  },
  {
    id: "fb_pii_fields",
    question: "Which response fields contain PII or sensitive data that must never be exposed?",
    type: "multi_select",
    options: [],
    hint: "e.g. password, ssn, credit_card_number",
    category: "pii",
  },
  {
    id: "fb_business_rules",
    question: "Are there any business validation rules or constraints NOT visible in the API spec?",
    type: "textarea",
    hint: "e.g. username must be unique, max 5 active sessions per user",
    category: "business_rules",
  },
  {
    id: "fb_test_prefs",
    question: "Any specific test types or scenarios you want to prioritize?",
    type: "multi_select",
    options: ["Security", "Performance", "Compliance", "Edge Cases", "Workflow journeys"],
    hint: "We'll weight generation accordingly",
    category: "test_preferences",
  },
];

// ── Category labels ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  error_codes: "Error Codes",
  auth: "Authentication",
  business_rules: "Business Rules",
  workflow: "Workflows",
  pii: "PII & Sensitive Data",
  test_preferences: "Test Preferences",
};

// ── Main component ────────────────────────────────────────────────────────────

export default function QuestionnairePanel({ threadId, onSubmitted }: Props) {
  const questionnaireQuestions = useSessionStore((s) => s.questionnaireQuestions);
  const questions = questionnaireQuestions.length > 0 ? questionnaireQuestions : FALLBACK_QUESTIONS;

  const [answers, setAnswers] = useState<Record<string, string | string[]>>(() =>
    Object.fromEntries(
      questions.map((q) => [
        q.id,
        q.type === "multi_select" ? [] : "",
      ])
    )
  );
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answeredCount = Object.entries(answers).filter(([id, v]) =>
    !skipped.has(id) && (typeof v === "string" ? v.trim().length > 0 : v.length > 0)
  ).length;
  const skippedCount = skipped.size;
  const remainingCount = questions.length - answeredCount - skippedCount;

  const progressPct = questions.length > 0
    ? Math.round(((answeredCount + skippedCount) / questions.length) * 100)
    : 0;

  const handleChange = (id: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleToggleSkip = (id: string) => {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doSubmit = async (answersToSend: Record<string, unknown>) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await submitQuestionnaire(threadId, answersToSend);
      onSubmitted();
    } catch {
      setError("Failed to submit. Please try again.");
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    const filteredAnswers = Object.fromEntries(
      Object.entries(answers).filter(([id]) => !skipped.has(id))
    );
    doSubmit(filteredAnswers);
  };
  const handleSkipAll = () => doSubmit({});

  // Group questions by category for visual separation
  const categories = Array.from(new Set(questions.map((q) => q.category ?? "")));
  const grouped = categories.map((cat) => ({
    cat,
    label: cat ? (CATEGORY_LABELS[cat] ?? cat) : "",
    qs: questions.filter((q) => (q.category ?? "") === cat),
  }));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Sparkles size={14} className="text-accent" />
          </div>
          <h2 className="text-base font-bold text-text-primary">Help us generate better tests</h2>
        </div>
        <p className="text-xs text-text-secondary">
          {questionnaireQuestions.length > 0
            ? "These questions are tailored to gaps we found in your API spec. Every question is optional."
            : "Every question is optional — skip anything you don't want to answer."}
        </p>

        <div className="mt-3 space-y-1.5">
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-muted">
              {answeredCount} answered
              {skippedCount > 0 && <> · {skippedCount} skipped</>}
              {remainingCount > 0 && <> · {remainingCount} remaining</>}
            </span>
            <span className="text-[11px] font-semibold text-accent">{progressPct}%</span>
          </div>
        </div>
      </div>

      {/* Scrollable questions */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {grouped.map(({ cat, label, qs }) => (
          <div key={cat} className="space-y-3">
            {label && (
              <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                {label}
              </h3>
            )}
            {qs.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                value={answers[q.id] ?? (q.type === "multi_select" ? [] : "")}
                onChange={(v) => handleChange(q.id, v)}
                isSkipped={skipped.has(q.id)}
                onToggleSkip={() => handleToggleSkip(q.id)}
              />
            ))}
          </div>
        ))}

        {error && <p className="text-danger text-xs px-1">{error}</p>}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-6 py-4 border-t border-border bg-card flex items-center justify-between gap-3">
        <div className="text-xs text-text-muted">
          {answeredCount > 0 || skippedCount > 0 ? (
            <span className="text-success font-medium">
              {answeredCount > 0 && `${answeredCount} answered`}
              {answeredCount > 0 && skippedCount > 0 && " · "}
              {skippedCount > 0 && `${skippedCount} skipped`}
            </span>
          ) : (
            "All questions optional"
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSkipAll}
            disabled={isSubmitting}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50 px-3 py-2"
          >
            Skip all, use defaults
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 bg-accent text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-accent-hover disabled:opacity-60 transition-colors shadow-sm"
          >
            {isSubmitting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            {isSubmitting ? "Generating..." : "Generate Tests"}
          </button>
        </div>
      </div>
    </div>
  );
}
