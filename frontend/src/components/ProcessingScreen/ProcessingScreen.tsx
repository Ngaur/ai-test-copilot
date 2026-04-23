import { Check } from "lucide-react";
import type { ChatMessage, SessionStatus } from "@/types";

interface Props {
  filename: string;
  status: SessionStatus;
  messages: ChatMessage[];
}

const STEPS = [
  {
    label: "Index Spec",
    hint: "Parsing and indexing your API specification…",
    statuses: ["parsing"] as SessionStatus[],
  },
  {
    label: "Clarify",
    hint: "Waiting for questionnaire answers…",
    statuses: ["awaiting_questionnaire"] as SessionStatus[],
  },
  {
    label: "Generate Tests",
    hint: "Generating test cases with the AI model…",
    statuses: ["generating", "improving", "generating_schema", "awaiting_test_data_or_generate", "awaiting_test_data"] as SessionStatus[],
  },
  {
    label: "Automate & Export",
    hint: "Building feature files and Playwright tests…",
    statuses: ["generating_automation", "awaiting_playwright_confirmation", "ready_to_execute", "executing", "done"] as SessionStatus[],
  },
];

function statusToStep(status: SessionStatus): number {
  for (let i = 0; i < STEPS.length; i++) {
    if ((STEPS[i].statuses as string[]).includes(status)) return i;
  }
  return 0;
}

function currentHint(status: SessionStatus): string {
  const statusHints: Partial<Record<SessionStatus, string>> = {
    parsing: "Parsing and indexing your API specification…",
    generating: "Generating test cases — this may take a minute…",
    improving: "Refining test cases based on your feedback…",
    generating_schema: "Preparing automation schema…",
    awaiting_test_data_or_generate: "Waiting for test data upload or ready to generate…",
    awaiting_test_data: "Waiting for test data to generate automation…",
    generating_automation: "Building Gherkin feature files and Playwright tests…",
    awaiting_playwright_confirmation: "Feature files ready — waiting for confirmation…",
  };
  return statusHints[status] ?? "Processing…";
}

// Strip progress lines like "**3/15** — Generated: *Title*"
const PROGRESS_RE = /^\*\*\d+\/\d+\*\*/;

export default function ProcessingScreen({ filename, status, messages }: Props) {
  const currentStep = statusToStep(status);

  // Last 3 assistant messages, excluding progress-bar lines
  const activityLines = messages
    .filter((m) => m.role === "assistant" && !PROGRESS_RE.test(m.content))
    .slice(-3)
    .map((m) => m.content);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-12 px-8 bg-surface">
      {/* Filename */}
      <p className="text-text-muted text-sm font-medium tracking-wide">{filename}</p>

      {/* Step indicator */}
      <div className="flex items-start">
        {STEPS.map((step, i) => (
          <div key={i} className="flex items-start">
            {/* Node + label */}
            <div className="flex flex-col items-center gap-2.5 w-32">
              <div
                className={[
                  "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300",
                  i < currentStep
                    ? "bg-success text-white"
                    : i === currentStep
                    ? "bg-accent text-white ring-4 ring-accent/20"
                    : "bg-card text-text-muted border border-border",
                ].join(" ")}
              >
                {i < currentStep ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={[
                  "text-xs font-medium text-center leading-tight",
                  i === currentStep ? "text-text-primary" : "text-text-muted",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div
                className={[
                  "h-px w-16 mt-[18px] transition-colors duration-300",
                  i < currentStep ? "bg-success" : "bg-border",
                ].join(" ")}
              />
            )}
          </div>
        ))}
      </div>

      {/* Current hint pill */}
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <p className="text-text-secondary text-sm">{currentHint(status)}</p>
      </div>

      {/* Activity log */}
      {activityLines.length > 0 && (
        <div className="w-full max-w-xl space-y-1.5">
          {activityLines.map((line, i) => (
            <p
              key={i}
              className={[
                "text-xs text-text-secondary leading-relaxed truncate text-center",
                i < activityLines.length - 1 ? "opacity-50" : "",
              ].join(" ")}
            >
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
