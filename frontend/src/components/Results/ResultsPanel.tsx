import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  Code2,
  Download,
  ExternalLink,
  FlaskConical,
  PlayCircle,
} from "lucide-react";
import { useState } from "react";
import {
  downloadTestCases,
  executeTests,
  getGeneratedTest,
  getPlaywrightTest,
  getTestCases,
} from "@/api/chat";
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

function Badge({ label, styles }: { label: string; styles: Record<string, string> }) {
  const cls = styles[label] ?? "bg-card text-text-muted border-border";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cls}`}>
      {label}
    </span>
  );
}

// ── Left panel — read-only test case list ────────────────────────────────────

interface ListProps {
  testCases: TestCase[];
  selected: TestCase | null;
  onSelect: (tc: TestCase) => void;
  threadId: string;
}

function TestCaseList({ testCases, selected, onSelect, threadId }: ListProps) {
  const [downloading, setDownloading] = useState(false);

  return (
    <div className="flex flex-col h-full border-r border-border">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardList size={15} className="text-accent" />
          <span className="text-sm font-semibold text-text-primary">Test Cases</span>
          <span className="text-xs text-white bg-accent px-2 py-0.5 rounded-full font-medium ml-auto">
            {testCases.length}
          </span>
        </div>
        <div className="flex gap-1.5 text-[10px] text-text-muted mt-1 items-center">
          <span className="text-accent">{testCases.filter((t) => t.test_type === "Functional").length} func</span>
          <span>·</span>
          <span className="text-purple-500">{testCases.filter((t) => t.test_type === "Negative").length} neg</span>
          <span>·</span>
          <span className="text-pink-500">{testCases.filter((t) => t.test_type === "Edge Case").length} edge</span>
          <button
            onClick={async () => {
              setDownloading(true);
              try { await downloadTestCases(threadId); }
              finally { setDownloading(false); }
            }}
            disabled={downloading}
            title="Download as Excel"
            className="ml-auto flex items-center gap-1 text-text-muted hover:text-accent transition-colors disabled:opacity-50"
          >
            <Download size={11} />
            <span>{downloading ? "…" : "Excel"}</span>
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {testCases.map((tc) => (
          <button
            key={tc.id}
            onClick={() => onSelect(tc)}
            className={[
              "w-full text-left px-4 py-3 border-b border-border transition-colors flex items-start gap-3",
              selected?.id === tc.id
                ? "bg-accent/5 border-l-2 border-l-accent"
                : "hover:bg-card",
            ].join(" ")}
          >
            <span
              className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${PRIORITY_DOT[tc.priority] ?? "bg-text-muted"}`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-primary truncate">{tc.title}</p>
              <p className="text-[10px] text-text-muted font-mono mt-0.5 truncate">{tc.endpoint}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Right panel — tabs (Manual detail / Feature Files / Playwright) ───────────

type Tab = "manual" | "feature" | "playwright";

interface RightProps {
  selected: TestCase | null;
  threadId: string;
  status: string;
}

function RightPanel({ selected, threadId, status }: RightProps) {
  const [tab, setTab] = useState<Tab>("manual");
  const { addMessage, updateStatus } = useSessionStore();

  const isDone = status === "done";
  const isRunning = status === "executing";

  const { data: featureData } = useQuery({
    queryKey: ["generated-test", threadId],
    queryFn: () => getGeneratedTest(threadId),
  });

  const { data: playwrightData } = useQuery({
    queryKey: ["playwright-test", threadId],
    queryFn: () => getPlaywrightTest(threadId),
  });

  const handleRun = async () => {
    if (!threadId || isRunning) return;
    try {
      await executeTests(threadId);
      updateStatus("executing");
      addMessage({ role: "assistant", content: "▶ Running automated tests — check back shortly for results." });
    } catch {
      addMessage({ role: "assistant", content: "Failed to start test execution. Please try again." });
    }
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "manual", label: "Manual", icon: <ClipboardList size={13} /> },
    { id: "feature", label: "Feature Files", icon: <Code2 size={13} /> },
    { id: "playwright", label: "Playwright", icon: <FlaskConical size={13} /> },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar + actions */}
      <div className="flex items-center border-b border-border flex-shrink-0 px-4">
        <div className="flex gap-0.5 flex-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "flex items-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors",
                tab === t.id
                  ? "text-text-primary border-b-2 border-text-primary -mb-px"
                  : "text-text-muted hover:text-text-secondary",
              ].join(" ")}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 py-2">
          {!isDone && (
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="flex items-center gap-1.5 bg-accent/10 border border-accent/30 text-accent text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-accent/20 disabled:opacity-50 transition-colors"
            >
              <PlayCircle size={13} />
              {isRunning ? "Running…" : "Run Tests"}
            </button>
          )}
          {isDone && (
            <a
              href="http://localhost:8000/api/v1/report/view/index.html"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 bg-success/10 border border-success/30 text-success text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-success/20 transition-colors"
            >
              <ExternalLink size={13} />
              View Report
            </a>
          )}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === "manual" && selected && (
          <div className="h-full overflow-y-auto scrollbar-thin p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-text-primary mb-2">{selected.title}</h2>
              <div className="flex flex-wrap gap-2">
                <Badge label={selected.test_type} styles={TYPE_STYLES} />
                <Badge label={selected.priority} styles={PRIORITY_STYLES} />
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono text-text-muted border border-border bg-surface">
                  {selected.endpoint}
                </span>
              </div>
            </div>
            {selected.preconditions.length > 0 && (
              <section>
                <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Preconditions</p>
                <ul className="space-y-1">
                  {selected.preconditions.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm text-text-secondary">
                      <span className="text-text-muted">•</span>{p}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section>
              <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Steps</p>
              <ol className="space-y-3">
                {selected.steps.map((s) => (
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
              <p className="text-sm text-text-secondary">{selected.expected_result}</p>
            </section>
            {selected.notes && (
              <section>
                <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Notes</p>
                <p className="text-sm text-text-muted italic">{selected.notes}</p>
              </section>
            )}
          </div>
        )}

        {tab === "feature" && (
          <div className="flex flex-col h-full overflow-hidden">
            {featureData?.content ? (
              <>
                <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-shrink-0">
                  <Code2 size={13} className="text-accent" />
                  <span className="text-xs font-mono text-text-muted truncate">
                    {featureData.file_path.split("/").pop()}
                  </span>
                </div>
                <pre className="flex-1 overflow-auto scrollbar-thin text-[12px] font-mono leading-relaxed text-text-primary bg-surface p-4 m-0">
                  {featureData.content}
                </pre>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted">
                <Code2 size={32} className="opacity-30" />
                <p className="text-sm">Feature files not generated yet</p>
              </div>
            )}
          </div>
        )}

        {tab === "playwright" && (
          <div className="flex flex-col h-full overflow-hidden">
            {playwrightData?.content ? (
              <>
                <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-shrink-0">
                  <FlaskConical size={13} className="text-accent" />
                  <span className="text-xs font-mono text-text-muted truncate">
                    {playwrightData.file_path.split("/").pop()}
                  </span>
                </div>
                <pre className="flex-1 overflow-auto scrollbar-thin text-[12px] font-mono leading-relaxed text-text-primary bg-surface p-4 m-0">
                  {playwrightData.content}
                </pre>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted">
                <FlaskConical size={32} className="opacity-30" />
                <p className="text-sm">Playwright tests not generated yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

interface Props {
  threadId: string;
  status: string;
}

export default function ResultsPanel({ threadId, status }: Props) {
  const [selected, setSelected] = useState<TestCase | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["test-cases", threadId],
    queryFn: () => getTestCases(threadId),
  });

  const testCases = data?.test_cases ?? [];

  if (!selected && testCases.length > 0) {
    setSelected(testCases[0]);
  }

  if (isLoading) {
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
      {/* Left — test case list */}
      <div className="w-72 flex-shrink-0 overflow-hidden flex flex-col">
        <TestCaseList
          testCases={testCases}
          selected={selected}
          onSelect={setSelected}
          threadId={threadId}
        />
      </div>

      {/* Right — tabs */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <RightPanel selected={selected} threadId={threadId} status={status} />
      </div>
    </div>
  );
}
