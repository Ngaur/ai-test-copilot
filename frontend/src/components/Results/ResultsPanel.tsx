import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart2,
  CheckSquare,
  ChevronRight,
  ClipboardList,
  Code2,
  Download,
  FlaskConical,
  PlayCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  downloadTestCases,
  executeTests,
  generateLoadTest,
  getGeneratedTest,
  getLoadTests,
  getPlaywrightTest,
  getReportSummary,
  getTestCases,
} from "@/api/chat";
import { useSessionStore } from "@/store/session";
import type { LoadTest, LoadTestConfig, TestCase } from "@/types";

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

// ── Results tab content ──────────────────────────────────────────────────────

function ResultsTabContent({ status, sessionId, onRun, isRunning, reportKey }: {
  status: string;
  sessionId: string;
  onRun: () => void;
  isRunning: boolean;
  reportKey: number;
}) {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // Reset loading shimmer whenever the report is refreshed
  useEffect(() => {
    setIframeLoaded(false);
  }, [reportKey]);

  const { data: summary, isError: summaryError } = useQuery({
    queryKey: ["report-summary", sessionId],
    queryFn: () => getReportSummary(sessionId),
    enabled: status === "done" && !!sessionId,
    retry: false,
  });

  if (status === "ready_to_execute") {
    return (
      <div className="flex flex-1 items-center justify-center h-full">
        <div className="text-center space-y-4 max-w-sm px-6">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto">
            <PlayCircle size={26} className="text-accent" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">Ready to Execute</h3>
            <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">
              Your Playwright tests are generated and ready. Click Run Tests to execute them — an interactive HTML report will appear here.
            </p>
          </div>
          <button
            onClick={onRun}
            disabled={isRunning}
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-colors shadow-sm"
          >
            <PlayCircle size={15} />
            Run Tests
          </button>
        </div>
      </div>
    );
  }

  if (status === "executing") {
    return (
      <div className="flex flex-1 items-center justify-center h-full">
        <div className="text-center space-y-4">
          <div className="flex gap-1.5 justify-center">
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                className="w-2.5 h-2.5 bg-accent rounded-full animate-bounce"
                style={{ animationDelay: `${d}ms` }}
              />
            ))}
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">Running Playwright tests…</h3>
            <p className="text-sm text-text-muted mt-1">This may take a few minutes depending on test count.</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "done") {
    const stat = summary?.statistic;
    const passed = stat?.passed ?? 0;
    const failed = (stat?.failed ?? 0) + (stat?.broken ?? 0);
    const skipped = stat?.skipped ?? 0;
    const total = stat?.total ?? 0;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    const failRate = total > 0 ? Math.round((failed / total) * 100) : 0;

    return (
      <div className="flex flex-col h-full">
        {/* Summary bar */}
        {!summaryError && stat && (
          <div className="flex-shrink-0 px-5 py-3 border-b border-border bg-card space-y-2">
            <div className="flex items-center gap-5">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-success">
                <span className="w-2 h-2 rounded-full bg-success" />
                {passed} Passed
              </span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-danger">
                <span className="w-2 h-2 rounded-full bg-danger" />
                {failed} Failed
              </span>
              <span className="flex items-center gap-1.5 text-sm text-text-muted">
                <span className="w-2 h-2 rounded-full bg-text-muted" />
                {skipped} Skipped
              </span>
              <span className="ml-auto text-xs text-text-muted">{total} total · {passRate}% pass rate</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface overflow-hidden flex">
              <div className="h-full bg-success transition-all" style={{ width: `${passRate}%` }} />
              <div className="h-full bg-danger transition-all" style={{ width: `${failRate}%` }} />
            </div>
          </div>
        )}

        {summaryError && (
          <div className="flex-shrink-0 px-5 py-2 border-b border-border bg-card">
            <p className="text-xs text-text-muted">
              Report summary unavailable — install Allure CLI to enable: <code className="font-mono">npm install -g allure-commandline</code>
            </p>
          </div>
        )}

        {/* Allure report iframe */}
        <div className="flex-1 relative overflow-hidden">
          {!iframeLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface z-10">
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
          )}
          <iframe
            key={reportKey}
            src={`/api/v1/report/view/${sessionId}/index.html`}
            title="Test Report"
            className="w-full h-full border-0"
            onLoad={() => setIframeLoaded(true)}
          />
        </div>
      </div>
    );
  }

  return null;
}

// ── Performance tab ──────────────────────────────────────────────────────────

function defaultLoadConfig(index: number): LoadTestConfig {
  return {
    name: `Load Test ${index}`,
    selectedEndpoints: [],
    vus: 10,
    duration: "2m",
    rampUp: "30s",
    rampDown: "30s",
    p95Ms: 500,
    p99Ms: 1000,
    errorRatePct: 1,
  };
}

function downloadScript(lt: LoadTest) {
  const blob = new Blob([lt.content], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${lt.name.replace(/\s+/g, "_").toLowerCase()}.js`;
  a.click();
  URL.revokeObjectURL(url);
}

function PerformanceTabContent({ threadId, testCases }: { threadId: string; testCases: TestCase[] }) {
  const uniqueEndpoints = useMemo(
    () => [...new Set(testCases.map((tc) => tc.endpoint).filter(Boolean))].sort(),
    [testCases],
  );

  const { data: ltData, refetch } = useQuery({
    queryKey: ["load-tests", threadId],
    queryFn: () => getLoadTests(threadId),
  });
  const loadTests = ltData?.load_tests ?? [];

  const [rightMode, setRightMode] = useState<"config" | "preview">("config");
  const [previewTarget, setPreviewTarget] = useState<LoadTest | null>(null);
  const [config, setConfig] = useState<LoadTestConfig>(defaultLoadConfig(1));
  const [nextIndex, setNextIndex] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const allSelected = config.selectedEndpoints.length === uniqueEndpoints.length && uniqueEndpoints.length > 0;

  const toggleEndpoint = (ep: string) => {
    setConfig((c) => ({
      ...c,
      selectedEndpoints: c.selectedEndpoints.includes(ep)
        ? c.selectedEndpoints.filter((e) => e !== ep)
        : [...c.selectedEndpoints, ep],
    }));
  };

  const handleGenerate = useCallback(async () => {
    if (!config.selectedEndpoints.length || generating) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const lt = await generateLoadTest(threadId, config);
      await refetch();
      setPreviewTarget(lt);
      setRightMode("preview");
      setConfig(defaultLoadConfig(nextIndex));
      setNextIndex((n) => n + 1);
    } catch (e: unknown) {
      setGenerateError(e instanceof Error ? e.message : "Generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [config, generating, nextIndex, refetch, threadId]);

  if (uniqueEndpoints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted">
        <Activity size={32} className="opacity-30" />
        <p className="text-sm">No test cases available to derive endpoints from.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left — load test list */}
      <div className="w-56 flex-shrink-0 border-r border-border flex flex-col">
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
          {loadTests.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 gap-1.5 px-2">
              <p className="text-[11px] text-text-muted text-center">No load scripts yet.</p>
            </div>
          ) : (
            loadTests.map((lt) => (
              <button
                key={lt.id}
                onClick={() => { setPreviewTarget(lt); setRightMode("preview"); }}
                className={[
                  "w-full text-left px-2.5 py-2 rounded-lg border transition-all",
                  previewTarget?.id === lt.id && rightMode === "preview"
                    ? "border-accent/50 bg-accent/5"
                    : "border-border hover:border-accent/30 hover:bg-card",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                    <span className="text-xs font-medium text-text-primary truncate">{lt.name}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadScript(lt); }}
                    className="text-text-muted hover:text-accent transition-colors flex-shrink-0"
                    title="Download"
                  >
                    <Download size={11} />
                  </button>
                </div>
                <p className="text-[10px] text-text-muted mt-0.5 pl-3">{lt.vus} VUs · {lt.duration}</p>
              </button>
            ))
          )}
        </div>
        <div className="p-2 border-t border-border flex-shrink-0">
          <button
            onClick={() => { setRightMode("config"); setPreviewTarget(null); }}
            disabled={generating}
            className="w-full flex items-center justify-center gap-1 border border-dashed border-border text-text-muted text-xs py-1.5 rounded-lg hover:border-accent/40 hover:text-text-secondary disabled:opacity-40 transition-colors"
          >
            <Plus size={12} /> Add Load Test
          </button>
        </div>
      </div>

      {/* Right — config form or preview */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        {rightMode === "preview" && previewTarget ? (
          /* Preview pane */
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border flex-shrink-0">
              <button
                onClick={() => setRightMode("config")}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                <ChevronRight size={12} className="rotate-180" />
                Back
              </button>
              <span className="text-xs font-mono text-text-muted truncate flex-1">{previewTarget.name}.js</span>
              <button
                onClick={() => downloadScript(previewTarget)}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors"
              >
                <Download size={12} /> Download
              </button>
            </div>
            <pre className="flex-1 overflow-auto scrollbar-thin text-[11px] font-mono leading-relaxed text-text-primary bg-surface p-4 m-0 whitespace-pre">
              {previewTarget.content}
            </pre>
          </div>
        ) : (
          /* Config form */
          <div className="h-full overflow-y-auto scrollbar-thin p-4 space-y-4">
            {/* Name */}
            <div>
              <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block mb-1">Name</label>
              <input
                type="text"
                value={config.name}
                onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))}
                disabled={generating}
                className="w-full text-sm text-text-primary bg-card border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
            </div>

            {/* Endpoints */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Endpoints</label>
                <button
                  onClick={() => setConfig((c) => ({ ...c, selectedEndpoints: allSelected ? [] : [...uniqueEndpoints] }))}
                  disabled={generating}
                  className="flex items-center gap-1 text-[10px] text-accent hover:text-accent-hover disabled:opacity-40 transition-colors"
                >
                  {allSelected ? <CheckSquare size={11} /> : <Square size={11} />}
                  {allSelected ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="border border-border rounded-lg overflow-hidden">
                {uniqueEndpoints.map((ep, i) => (
                  <label
                    key={ep}
                    className={[
                      "flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors text-xs",
                      i < uniqueEndpoints.length - 1 ? "border-b border-border" : "",
                      generating ? "opacity-50 cursor-not-allowed" : "hover:bg-card",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={config.selectedEndpoints.includes(ep)}
                      onChange={() => toggleEndpoint(ep)}
                      disabled={generating}
                      className="accent-accent"
                    />
                    <span className="font-mono text-text-primary truncate" title={ep}>{ep}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Load profile (compact 2-col grid) */}
            <div>
              <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block mb-1.5">Load Profile</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { label: "VUs", key: "vus", type: "number" },
                  { label: "Duration", key: "duration", type: "text" },
                  { label: "Ramp-up", key: "rampUp", type: "text" },
                  { label: "Ramp-down", key: "rampDown", type: "text" },
                ] as { label: string; key: keyof LoadTestConfig; type: string }[]).map(({ label, key, type }) => (
                  <div key={key}>
                    <label className="text-[10px] text-text-muted block mb-0.5">{label}</label>
                    <input
                      type={type}
                      value={config[key] as string | number}
                      onChange={(e) => setConfig((c) => ({
                        ...c,
                        [key]: type === "number" ? parseInt(e.target.value) || 1 : e.target.value,
                      }))}
                      disabled={generating}
                      className="w-full text-xs text-text-primary bg-card border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Thresholds */}
            <div>
              <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block mb-1.5">Thresholds</label>
              <div className="space-y-1.5">
                {([
                  { label: "p95 latency (ms) <", key: "p95Ms" },
                  { label: "p99 latency (ms) <", key: "p99Ms" },
                  { label: "Error rate (%) <", key: "errorRatePct" },
                ] as { label: string; key: keyof LoadTestConfig }[]).map(({ label, key }) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[11px] text-text-muted flex-1">{label}</span>
                    <input
                      type="number"
                      min={0}
                      value={config[key] as number}
                      onChange={(e) => setConfig((c) => ({ ...c, [key]: parseFloat(e.target.value) || 0 }))}
                      disabled={generating}
                      className="w-20 text-xs text-text-primary bg-card border border-border rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>
            </div>

            {generateError && <p className="text-xs text-danger">{generateError}</p>}
            <button
              onClick={handleGenerate}
              disabled={generating || config.selectedEndpoints.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-50 transition-colors"
            >
              {generating ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {generating ? "Generating…" : "Generate Load Script"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Right panel — tabs (Manual detail / Feature Files / Playwright / Performance / Results) ─

type Tab = "manual" | "feature" | "playwright" | "performance" | "results";

interface RightProps {
  selected: TestCase | null;
  threadId: string;
  status: string;
  testCases: TestCase[];
}

function RightPanel({ selected, threadId, status, testCases }: RightProps) {
  const [tab, setTab] = useState<Tab>("manual");
  const [reportKey, setReportKey] = useState(0);
  const prevStatusRef = useRef(status);
  const { addMessage, updateStatus, session } = useSessionStore();
  const sessionId = session?.sessionId ?? "";
  const queryClient = useQueryClient();

  const isDone = status === "done";
  const isRunning = status === "executing";

  // Auto-switch to Results tab on execution-related status
  useEffect(() => {
    if (status === "ready_to_execute" || status === "executing" || status === "done") {
      setTab("results");
    }
  }, [status]);

  // Detect executing → done transition to reload the report
  useEffect(() => {
    if (prevStatusRef.current === "executing" && status === "done") {
      setReportKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: ["report-summary", sessionId] });
    }
    prevStatusRef.current = status;
  }, [status, sessionId, queryClient]);

  const { data: featureData } = useQuery({
    queryKey: ["generated-test", threadId],
    queryFn: () => getGeneratedTest(threadId),
  });

  const { data: playwrightData } = useQuery({
    queryKey: ["playwright-test", threadId],
    queryFn: () => getPlaywrightTest(threadId),
  });

  const handleRun = async () => {
    if (!threadId || !sessionId || isRunning) return;
    try {
      await executeTests(threadId, sessionId);
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
    { id: "performance", label: "Performance", icon: <Activity size={13} /> },
    { id: "results", label: "Results", icon: <BarChart2 size={13} /> },
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

        {/* Run Tests shortcut — visible whenever not done; Re-run when done */}
        <div className="py-2">
          {isDone ? (
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="flex items-center gap-1.5 bg-card border border-border text-text-muted text-xs font-medium px-3 py-1.5 rounded-lg hover:text-text-secondary hover:border-accent/30 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={13} />
              Re-run Tests
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="flex items-center gap-1.5 bg-accent/10 border border-accent/30 text-accent text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-accent/20 disabled:opacity-50 transition-colors"
            >
              <PlayCircle size={13} />
              {isRunning ? "Running…" : "Run Tests"}
            </button>
          )}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col">
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

        {tab === "performance" && (
          <PerformanceTabContent threadId={threadId} testCases={testCases} />
        )}

        {tab === "results" && (
          <ResultsTabContent
            status={status}
            sessionId={sessionId}
            onRun={handleRun}
            isRunning={isRunning}
            reportKey={reportKey}
          />
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
        <RightPanel selected={selected} threadId={threadId} status={status} testCases={testCases} />
      </div>
    </div>
  );
}
