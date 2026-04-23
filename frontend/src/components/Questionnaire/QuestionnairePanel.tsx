import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Loader2,
  Minus,
  Plus,
  SkipForward,
  Sparkles,
  X,
} from "lucide-react";
import { submitQuestionnaire } from "@/api/chat";
import type { QuestionnaireAnswers } from "@/types";
import { useSessionStore } from "@/store/session";

interface Props {
  threadId: string;
  onSubmitted: () => void;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function emptyAnswers(): QuestionnaireAnswers {
  return {
    s1: { product_name: "", auth_type: "", base_url: "", user_roles: [] },
    s2: { p1_endpoints: [], error_codes: { validation: "", conflict: "", unauthorized: "", forbidden: "", rate_limit: "" }, idempotent_endpoints: [] },
    s3: { validation_rules: "", pii_fields: [], data_constraints: "" },
    s4: { user_journeys: [], state_machines: "", failure_scenarios: "" },
    s5: { test_types: [], negative_pct: "40", custom_tags: [] },
  };
}

function countAnswered(answers: QuestionnaireAnswers): { answered: number; total: number } {
  let answered = 0;
  const total = 14; // total answerable questions

  if (answers.s1.product_name.trim()) answered++;
  if (answers.s1.auth_type) answered++;
  if (answers.s1.base_url.trim()) answered++;
  if (answers.s1.user_roles.length > 0) answered++;

  if (answers.s2.p1_endpoints.length > 0) answered++;
  if (Object.values(answers.s2.error_codes).some((v) => v.trim())) answered++;
  if (answers.s2.idempotent_endpoints.length > 0) answered++;

  if (answers.s3.validation_rules.trim()) answered++;
  if (answers.s3.pii_fields.length > 0) answered++;
  if (answers.s3.data_constraints.trim()) answered++;

  if (answers.s4.user_journeys.length > 0) answered++;
  if (answers.s4.state_machines.trim()) answered++;
  if (answers.s4.failure_scenarios.trim()) answered++;

  if (answers.s5.test_types.length > 0) answered++;

  return { answered: Math.min(answered, total), total };
}

// ── chip input ───────────────────────────────────────────────────────────────

function ChipInput({
  label,
  chips,
  onChange,
  placeholder = "Add…",
}: {
  label?: string;
  chips: string[];
  onChange: (chips: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !chips.includes(v)) onChange([...chips, v]);
    setInput("");
  };
  return (
    <div className="space-y-1.5">
      {label && <p className="text-xs text-text-secondary">{label}</p>}
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {chips.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 bg-accent/10 text-accent text-[11px] font-medium px-2 py-0.5 rounded-full"
          >
            {c}
            <button onClick={() => onChange(chips.filter((x) => x !== c))} className="hover:text-danger transition-colors">
              <X size={10} />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
            placeholder={placeholder}
            className="text-[11px] text-text-primary bg-transparent border-none outline-none placeholder-text-muted w-20"
          />
          {input.trim() && (
            <button onClick={add} className="text-accent hover:text-accent-hover">
              <Plus size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── endpoint checkbox list ───────────────────────────────────────────────────

function EndpointChecklist({
  label,
  all,
  selected,
  onChange,
}: {
  label: string;
  all: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (ep: string) => {
    if (selected.includes(ep)) onChange(selected.filter((x) => x !== ep));
    else onChange([...selected, ep]);
  };
  if (!all.length) {
    return (
      <p className="text-xs text-text-muted italic">
        No structured endpoints detected (unstructured spec — specify endpoints manually if needed).
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-text-secondary">{label}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {all.map((ep) => (
          <label key={ep} className="flex items-start gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={selected.includes(ep)}
              onChange={() => toggle(ep)}
              className="mt-0.5 accent-accent flex-shrink-0"
            />
            <span className="text-[11px] text-text-primary truncate group-hover:text-accent transition-colors">{ep}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── journey builder ──────────────────────────────────────────────────────────

function JourneyBuilder({
  journeys,
  onChange,
}: {
  journeys: Array<{ name: string; goal: string; steps: string }>;
  onChange: (v: Array<{ name: string; goal: string; steps: string }>) => void;
}) {
  const add = () => onChange([...journeys, { name: "", goal: "", steps: "" }]);
  const remove = (i: number) => onChange(journeys.filter((_, idx) => idx !== i));
  const update = (i: number, field: "name" | "goal" | "steps", value: string) => {
    const next = journeys.map((j, idx) => (idx === i ? { ...j, [field]: value } : j));
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {journeys.map((j, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-text-primary">Journey {i + 1}</span>
            <button onClick={() => remove(i)} className="text-text-muted hover:text-danger transition-colors">
              <X size={12} />
            </button>
          </div>
          <input
            value={j.name}
            onChange={(e) => update(i, "name", e.target.value)}
            placeholder="Journey name (e.g. New user checkout)"
            className="w-full text-xs bg-surface border border-border rounded-lg px-3 py-1.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60"
          />
          <input
            value={j.goal}
            onChange={(e) => update(i, "goal", e.target.value)}
            placeholder="Goal (e.g. User registers and places first order)"
            className="w-full text-xs bg-surface border border-border rounded-lg px-3 py-1.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60"
          />
          <textarea
            value={j.steps}
            onChange={(e) => update(i, "steps", e.target.value)}
            rows={2}
            placeholder="Endpoint sequence (e.g. POST /auth/login → POST /orders → POST /payments)"
            className="w-full text-xs bg-surface border border-border rounded-lg px-3 py-1.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 resize-none"
          />
        </div>
      ))}
      <button
        onClick={add}
        className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
      >
        <Plus size={13} />
        Add journey
      </button>
    </div>
  );
}

// ── section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  answeredCount,
  totalCount,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  answeredCount: number;
  totalCount: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface/50 transition-colors text-left"
      >
        <span className="text-accent flex-shrink-0">{icon}</span>
        <span className="flex-1 text-sm font-semibold text-text-primary">{title}</span>
        {answeredCount > 0 && (
          <span className="text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full flex-shrink-0">
            {answeredCount}/{totalCount}
          </span>
        )}
        {answeredCount === 0 && (
          <span className="text-[10px] text-text-muted flex-shrink-0">{totalCount} questions</span>
        )}
        <span className="text-text-muted flex-shrink-0">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open && <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">{children}</div>}
    </div>
  );
}

// ── question row ─────────────────────────────────────────────────────────────

function QuestionRow({
  label,
  hint,
  answered,
  skipped,
  onSkip,
  children,
}: {
  label: string;
  hint?: string;
  answered: boolean;
  skipped: boolean;
  onSkip: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "flex gap-3 rounded-lg p-3 border transition-all",
        answered
          ? "border-success/30 bg-success/5 border-l-[3px] border-l-success"
          : skipped
          ? "border-border bg-surface/50 opacity-60"
          : "border-border",
      ].join(" ")}
    >
      <div className="flex-shrink-0 mt-0.5">
        {answered ? (
          <CheckCircle2 size={14} className="text-success" />
        ) : skipped ? (
          <Minus size={14} className="text-text-muted" />
        ) : (
          <HelpCircle size={14} className="text-text-muted" />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={`text-xs font-medium ${skipped ? "line-through text-text-muted" : "text-text-primary"}`}>
              {label}
            </p>
            {hint && !skipped && <p className="text-[11px] text-text-muted mt-0.5">{hint}</p>}
          </div>
          <button
            onClick={onSkip}
            className="flex-shrink-0 flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors whitespace-nowrap"
          >
            <SkipForward size={10} />
            {skipped ? "Unskip" : "Skip"}
          </button>
        </div>
        {!skipped && <div>{children}</div>}
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function QuestionnairePanel({ threadId, onSubmitted }: Props) {
  const [answers, setAnswers] = useState<QuestionnaireAnswers>(emptyAnswers);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["s1"]));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derive dynamic endpoint list from the last AI message that listed endpoints
  const messages = useSessionStore((s) => s.messages);
  const endpointsList: string[] = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.content.includes("Discovered endpoints:")) {
        const match = msg.content.match(/\*\*Discovered endpoints:\*\*\n([\s\S]*)/);
        if (match) {
          return match[1]
            .split("\n")
            .map((l) => l.replace(/^-\s*/, "").trim())
            .filter(Boolean);
        }
      }
    }
    return [];
  })();

  const toggleSkip = (key: string) => {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sectionAnsweredCount = (section: keyof QuestionnaireAnswers): number => {
    const a = answers[section] as Record<string, unknown>;
    return Object.entries(a).filter(([k, v]) => {
      if (skipped.has(`${section}_${k}`)) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "object" && v !== null) return Object.values(v).some((x) => String(x).trim());
      return Boolean(String(v).trim());
    }).length;
  };

  const sectionTotalCount = (section: keyof QuestionnaireAnswers): number =>
    Object.keys(answers[section]).length;

  const { answered, total } = countAnswered(answers);
  const progressPct = Math.round((answered / total) * 100);

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await submitQuestionnaire(threadId, answers);
      onSubmitted();
    } catch {
      setError("Failed to submit questionnaire. Please try again.");
      setIsSubmitting(false);
    }
  };

  const handleSkipAll = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await submitQuestionnaire(threadId, emptyAnswers());
      onSubmitted();
    } catch {
      setError("Failed to proceed. Please try again.");
      setIsSubmitting(false);
    }
  };

  const AUTH_TYPES = [
    "Bearer Token (JWT)",
    "API Key (header)",
    "API Key (query param)",
    "OAuth 2.0",
    "Basic Auth",
    "No auth",
  ];

  const TEST_TYPES = ["Functional", "Negative", "Security", "Performance", "Compliance"];

  const PII_DEFAULTS = ["password", "ssn", "credit_card_number", "cvv", "date_of_birth"];

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
          Every question is optional — skip anything you don't want to answer, or click Generate Tests to use defaults.
        </p>

        {/* Progress bar */}
        <div className="mt-3 space-y-1.5">
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-muted">
              {answered} answered · {total - answered} remaining
            </span>
            <span className="text-[11px] font-semibold text-accent">{progressPct}%</span>
          </div>
        </div>
      </div>

      {/* Scrollable questions */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">

        {/* ── Section 1: API Identity ─────────────────────────────────── */}
        <Section
          title="API Identity"
          icon={<span className="text-sm font-bold">1</span>}
          answeredCount={sectionAnsweredCount("s1")}
          totalCount={sectionTotalCount("s1")}
          open={openSections.has("s1")}
          onToggle={() => toggleSection("s1")}
        >
          <QuestionRow
            label="API / Product name"
            hint="Used in test suite titles and Allure report labels"
            answered={Boolean(answers.s1.product_name.trim())}
            skipped={skipped.has("s1_product_name")}
            onSkip={() => toggleSkip("s1_product_name")}
          >
            <input
              value={answers.s1.product_name}
              onChange={(e) =>
                setAnswers((a) => ({ ...a, s1: { ...a.s1, product_name: e.target.value } }))
              }
              placeholder="e.g. Payment API"
              className="w-full text-xs bg-surface border border-border rounded-lg px-3 py-1.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 transition-colors"
            />
          </QuestionRow>

          <QuestionRow
            label="Authentication mechanism"
            hint="Tailors auth test cases to your actual auth strategy"
            answered={Boolean(answers.s1.auth_type)}
            skipped={skipped.has("s1_auth_type")}
            onSkip={() => toggleSkip("s1_auth_type")}
          >
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {AUTH_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="auth_type"
                    checked={answers.s1.auth_type === type}
                    onChange={() =>
                      setAnswers((a) => ({ ...a, s1: { ...a.s1, auth_type: type } }))
                    }
                    className="accent-accent"
                  />
                  <span className="text-xs text-text-primary">{type}</span>
                </label>
              ))}
            </div>
          </QuestionRow>

          <QuestionRow
            label="Test environment base URL"
            hint="Sets TEST_BASE_URL in generated conftest.py"
            answered={Boolean(answers.s1.base_url.trim())}
            skipped={skipped.has("s1_base_url")}
            onSkip={() => toggleSkip("s1_base_url")}
          >
            <input
              value={answers.s1.base_url}
              onChange={(e) =>
                setAnswers((a) => ({ ...a, s1: { ...a.s1, base_url: e.target.value } }))
              }
              placeholder="e.g. https://api-staging.company.com"
              className="w-full text-xs bg-surface border border-border rounded-lg px-3 py-1.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 transition-colors"
            />
          </QuestionRow>

          <QuestionRow
            label="User roles with different access rights"
            hint="Generates RBAC authorization test cases per role per endpoint"
            answered={answers.s1.user_roles.length > 0}
            skipped={skipped.has("s1_user_roles")}
            onSkip={() => toggleSkip("s1_user_roles")}
          >
            <ChipInput
              chips={answers.s1.user_roles}
              onChange={(v) => setAnswers((a) => ({ ...a, s1: { ...a.s1, user_roles: v } }))}
              placeholder="admin, viewer…"
            />
          </QuestionRow>
        </Section>

        {/* ── Section 2: Critical Endpoints ──────────────────────────────── */}
        <Section
          title="Critical Endpoints"
          icon={<span className="text-sm font-bold">2</span>}
          answeredCount={sectionAnsweredCount("s2")}
          totalCount={sectionTotalCount("s2")}
          open={openSections.has("s2")}
          onToggle={() => toggleSection("s2")}
        >
          <QuestionRow
            label="P1-Critical endpoints (mark for extra test depth)"
            hint="P1 endpoints get 2× more test cases — more security, boundary, and auth scenarios"
            answered={answers.s2.p1_endpoints.length > 0}
            skipped={skipped.has("s2_p1_endpoints")}
            onSkip={() => toggleSkip("s2_p1_endpoints")}
          >
            <EndpointChecklist
              label={endpointsList.length ? `${endpointsList.length} endpoints discovered — check P1-Critical:` : ""}
              all={endpointsList}
              selected={answers.s2.p1_endpoints}
              onChange={(v) => setAnswers((a) => ({ ...a, s2: { ...a.s2, p1_endpoints: v } }))}
            />
          </QuestionRow>

          <QuestionRow
            label="HTTP error codes for each error class"
            hint="Makes every error assertion use your exact status codes, not defaults"
            answered={Object.values(answers.s2.error_codes).some((v) => v.trim())}
            skipped={skipped.has("s2_error_codes")}
            onSkip={() => toggleSkip("s2_error_codes")}
          >
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["validation", "Validation error"],
                  ["conflict", "Duplicate / conflict"],
                  ["unauthorized", "Unauthorized (auth)"],
                  ["forbidden", "Forbidden (RBAC)"],
                  ["rate_limit", "Rate limited"],
                ] as [string, string][]
              ).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[11px] text-text-secondary w-28 flex-shrink-0">{label}</span>
                  <input
                    type="text"
                    value={answers.s2.error_codes[key] ?? ""}
                    onChange={(e) =>
                      setAnswers((a) => ({
                        ...a,
                        s2: { ...a.s2, error_codes: { ...a.s2.error_codes, [key]: e.target.value } },
                      }))
                    }
                    placeholder="e.g. 422"
                    maxLength={3}
                    className="w-16 text-xs bg-surface border border-border rounded px-2 py-1 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 text-center"
                  />
                </div>
              ))}
            </div>
          </QuestionRow>

          <QuestionRow
            label="Idempotent endpoints (duplicate POST should return 2xx, not 409)"
            hint="Prevents false duplicate-call failures in generated tests"
            answered={answers.s2.idempotent_endpoints.length > 0}
            skipped={skipped.has("s2_idempotent_endpoints")}
            onSkip={() => toggleSkip("s2_idempotent_endpoints")}
          >
            <EndpointChecklist
              label=""
              all={endpointsList.filter((ep) => ep.startsWith("POST") || ep.startsWith("PUT"))}
              selected={answers.s2.idempotent_endpoints}
              onChange={(v) =>
                setAnswers((a) => ({ ...a, s2: { ...a.s2, idempotent_endpoints: v } }))
              }
            />
          </QuestionRow>
        </Section>

        {/* ── Section 3: Business Rules ───────────────────────────────────── */}
        <Section
          title="Business Rules"
          icon={<span className="text-sm font-bold">3</span>}
          answeredCount={sectionAnsweredCount("s3")}
          totalCount={sectionTotalCount("s3")}
          open={openSections.has("s3")}
          onToggle={() => toggleSection("s3")}
        >
          <QuestionRow
            label="Business validation rules NOT in the API spec"
            hint="Each rule becomes a dedicated negative test case with a specific assertion"
            answered={Boolean(answers.s3.validation_rules.trim())}
            skipped={skipped.has("s3_validation_rules")}
            onSkip={() => toggleSkip("s3_validation_rules")}
          >
            <textarea
              value={answers.s3.validation_rules}
              onChange={(e) =>
                setAnswers((a) => ({ ...a, s3: { ...a.s3, validation_rules: e.target.value } }))
              }
              rows={3}
              placeholder={"- Email must be lowercase before storage\n- Username: 3-20 chars, alphanumeric only\n- Max 5 active sessions per user"}
              className="w-full text-xs bg-surface border border-border rounded-lg px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 resize-none font-mono"
            />
          </QuestionRow>

          <QuestionRow
            label="PII / sensitive fields that must never appear in API responses"
            hint="Adds absence assertions for these fields in every success response"
            answered={answers.s3.pii_fields.length > 0}
            skipped={skipped.has("s3_pii_fields")}
            onSkip={() => toggleSkip("s3_pii_fields")}
          >
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {PII_DEFAULTS.map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      const next = answers.s3.pii_fields.includes(f)
                        ? answers.s3.pii_fields.filter((x) => x !== f)
                        : [...answers.s3.pii_fields, f];
                      setAnswers((a) => ({ ...a, s3: { ...a.s3, pii_fields: next } }));
                    }}
                    className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                      answers.s3.pii_fields.includes(f)
                        ? "bg-accent/10 border-accent/40 text-accent font-medium"
                        : "border-border text-text-muted hover:border-accent/40"
                    }`}
                  >
                    {answers.s3.pii_fields.includes(f) ? "✓ " : ""}{f}
                  </button>
                ))}
              </div>
              <ChipInput
                chips={answers.s3.pii_fields.filter((f) => !PII_DEFAULTS.includes(f))}
                onChange={(v) =>
                  setAnswers((a) => ({
                    ...a,
                    s3: { ...a.s3, pii_fields: [...PII_DEFAULTS.filter((d) => answers.s3.pii_fields.includes(d)), ...v] },
                  }))
                }
                placeholder="Add custom field…"
              />
            </div>
          </QuestionRow>

          <QuestionRow
            label="Additional data constraints (e.g. FK rules, uniqueness, cascades)"
            answered={Boolean(answers.s3.data_constraints.trim())}
            skipped={skipped.has("s3_data_constraints")}
            onSkip={() => toggleSkip("s3_data_constraints")}
          >
            <textarea
              value={answers.s3.data_constraints}
              onChange={(e) =>
                setAnswers((a) => ({ ...a, s3: { ...a.s3, data_constraints: e.target.value } }))
              }
              rows={2}
              placeholder={"- Deleting a user cascades to sessions but not orders\n- Product SKU must be globally unique"}
              className="w-full text-xs bg-surface border border-border rounded-lg px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 resize-none font-mono"
            />
          </QuestionRow>
        </Section>

        {/* ── Section 4: Workflow Journeys ────────────────────────────────── */}
        <Section
          title="Workflow Journeys"
          icon={<span className="text-sm font-bold">4</span>}
          answeredCount={sectionAnsweredCount("s4")}
          totalCount={sectionTotalCount("s4")}
          open={openSections.has("s4")}
          onToggle={() => toggleSection("s4")}
        >
          <QuestionRow
            label="User journeys that chain multiple endpoints"
            hint="Each journey becomes a dedicated E2E workflow test case — far more valuable than inferred ones"
            answered={answers.s4.user_journeys.length > 0}
            skipped={skipped.has("s4_user_journeys")}
            onSkip={() => toggleSkip("s4_user_journeys")}
          >
            <JourneyBuilder
              journeys={answers.s4.user_journeys}
              onChange={(v) => setAnswers((a) => ({ ...a, s4: { ...a.s4, user_journeys: v } }))}
            />
          </QuestionRow>

          <QuestionRow
            label="Resource state machines (valid + invalid transitions)"
            hint="Generates workflow tests that assert invalid state transitions are rejected"
            answered={Boolean(answers.s4.state_machines.trim())}
            skipped={skipped.has("s4_state_machines")}
            onSkip={() => toggleSkip("s4_state_machines")}
          >
            <textarea
              value={answers.s4.state_machines}
              onChange={(e) =>
                setAnswers((a) => ({ ...a, s4: { ...a.s4, state_machines: e.target.value } }))
              }
              rows={3}
              placeholder={"Order states: draft → submitted → approved → shipped → delivered\nInvalid: cannot go from shipped back to submitted\nCancelled is terminal — no further transitions allowed"}
              className="w-full text-xs bg-surface border border-border rounded-lg px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 resize-none font-mono"
            />
          </QuestionRow>

          <QuestionRow
            label="Known multi-step failure scenarios"
            hint="These become the most valuable negative workflow tests — partial rollback, cascade, stale reference"
            answered={Boolean(answers.s4.failure_scenarios.trim())}
            skipped={skipped.has("s4_failure_scenarios")}
            onSkip={() => toggleSkip("s4_failure_scenarios")}
          >
            <textarea
              value={answers.s4.failure_scenarios}
              onChange={(e) =>
                setAnswers((a) => ({ ...a, s4: { ...a.s4, failure_scenarios: e.target.value } }))
              }
              rows={3}
              placeholder={"- If payment fails, order must roll back to 'pending' not 'confirmed'\n- Deleting a user with active orders must return 409\n- Updating a submitted quote must return 409, not silently succeed"}
              className="w-full text-xs bg-surface border border-border rounded-lg px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 resize-none font-mono"
            />
          </QuestionRow>
        </Section>

        {/* ── Section 5: Test Preferences ─────────────────────────────────── */}
        <Section
          title="Test Preferences"
          icon={<span className="text-sm font-bold">5</span>}
          answeredCount={sectionAnsweredCount("s5")}
          totalCount={sectionTotalCount("s5")}
          open={openSections.has("s5")}
          onToggle={() => toggleSection("s5")}
        >
          <QuestionRow
            label="Priority test types for this session"
            hint="Focuses generation effort on the categories that matter most to you"
            answered={answers.s5.test_types.length > 0}
            skipped={skipped.has("s5_test_types")}
            onSkip={() => toggleSkip("s5_test_types")}
          >
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {TEST_TYPES.map((type) => {
                const checked = answers.s5.test_types.includes(type);
                return (
                  <label key={type} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? answers.s5.test_types.filter((x) => x !== type)
                          : [...answers.s5.test_types, type];
                        setAnswers((a) => ({ ...a, s5: { ...a.s5, test_types: next } }));
                      }}
                      className="accent-accent"
                    />
                    <span className="text-xs text-text-primary">{type}</span>
                  </label>
                );
              })}
            </div>
          </QuestionRow>

          <QuestionRow
            label="Minimum negative / edge case percentage"
            hint="Default is 40% — increase for security-sensitive APIs"
            answered={answers.s5.negative_pct !== "40" && Boolean(answers.s5.negative_pct)}
            skipped={skipped.has("s5_negative_pct")}
            onSkip={() => toggleSkip("s5_negative_pct")}
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={10}
                max={90}
                value={answers.s5.negative_pct}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, s5: { ...a.s5, negative_pct: e.target.value } }))
                }
                className="w-20 text-xs bg-surface border border-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:border-accent/60 text-center"
              />
              <span className="text-xs text-text-secondary">% of all test cases (default: 40%)</span>
            </div>
          </QuestionRow>

          <QuestionRow
            label="Custom Gherkin / test tags for your team"
            hint="Added to every generated scenario alongside @regression and @sanity"
            answered={answers.s5.custom_tags.length > 0}
            skipped={skipped.has("s5_custom_tags")}
            onSkip={() => toggleSkip("s5_custom_tags")}
          >
            <ChipInput
              chips={answers.s5.custom_tags}
              onChange={(v) => setAnswers((a) => ({ ...a, s5: { ...a.s5, custom_tags: v } }))}
              placeholder="@payment-team…"
            />
          </QuestionRow>
        </Section>

        {error && <p className="text-danger text-xs px-1">{error}</p>}
      </div>

      {/* Footer CTA */}
      <div className="flex-shrink-0 px-6 py-4 border-t border-border bg-card flex items-center justify-between gap-3">
        <div className="text-xs text-text-muted">
          {answered > 0 ? (
            <span className="text-success font-medium">{answered} answered</span>
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
