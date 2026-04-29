import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  BarChart2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Code2,
  Download,
  FileCode2,
  RefreshCw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getSessionExecutionStatus,
  getSessionFeatureFiles,
  getSessionLoadTests,
  getSessionPlaywrightTest,
  getSessionReportSummary,
  getSessionTestCases,
  reExecuteSession,
} from "@/api/sessions";
import { useSessionStore } from "@/store/session";
import type { LoadTest, PastSession, TestCase } from "@/types";

// ---------------------------------------------------------------------------
// Shared badge helpers (mirrors TestCaseTable styles)
// ---------------------------------------------------------------------------

const PRIORITY_STYLES: Record<string, string> = {
  "P1-Critical": "bg-danger/15 text-danger border-danger/30",
  "P2-High":     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "P3-Medium":   "bg-warning/15 text-warning border-warning/30",
  "P4-Low":      "bg-text-muted/20 text-text-muted border-text-muted/30",
};

const TYPE_STYLES: Record<string, string> = {
  "Functional":  "bg-accent/15 text-accent border-accent/30",
  "Negative":    "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Edge Case":   "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "Security":    "bg-red-500/15 text-red-400 border-red-500/30",
  "Performance": "bg-green-500/15 text-green-400 border-green-500/30",
};

function Badge({
  label,
  styles,
}: {
  label: string;
  styles: Record<string, string>;
}) {
  const cls = styles[label] ?? "bg-card text-text-muted border-border";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cls}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Read-only test case row
// ---------------------------------------------------------------------------

function TestCaseRow({ tc }: { tc: TestCase }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-border hover:bg-card/50 cursor-pointer transition-colors group"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-3 py-3 w-8">
          <span className="text-text-muted group-hover:text-text-secondary transition-colors">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </td>
        <td className="px-2 py-3 text-xs font-mono text-text-muted whitespace-nowrap">{tc.id}</td>
        <td className="px-3 py-3 text-sm text-text-primary">{tc.title}</td>
        <td className="px-2 py-3 whitespace-nowrap">
          <Badge label={tc.test_type} styles={TYPE_STYLES} />
        </td>
        <td className="px-2 py-3 whitespace-nowrap">
          <Badge label={tc.priority} styles={PRIORITY_STYLES} />
        </td>
        <td className="px-3 py-3 text-xs text-text-muted font-mono whitespace-nowrap max-w-[180px] truncate">
          {tc.endpoint}
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border bg-surface">
          <td colSpan={6} className="px-5 py-4">
            <div className="space-y-3 text-xs">
              {tc.preconditions.length > 0 && (
                <section>
                  <p className="text-text-muted font-semibold uppercase tracking-wider text-[10px] mb-1.5">
                    Preconditions
                  </p>
                  <ul className="space-y-0.5">
                    {tc.preconditions.map((p, i) => (
                      <li key={i} className="flex gap-2 text-text-secondary">
                        <span className="text-text-muted mt-0.5">•</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <p className="text-text-muted font-semibold uppercase tracking-wider text-[10px] mb-1.5">
                  Steps
                </p>
                <ol className="space-y-2">
                  {tc.steps.map((s) => (
                    <li key={s.step_number} className="flex gap-3">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center text-[10px] font-bold text-text-muted">
                        {s.step_number}
                      </span>
                      <div className="flex-1">
                        <p className="text-text-primary">{s.action}</p>
                        <p className="text-success mt-0.5">↳ {s.expected_result}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <p className="text-text-muted font-semibold uppercase tracking-wider text-[10px] mb-1.5">
                  Expected Result
                </p>
                <p className="text-text-secondary">{tc.expected_result}</p>
              </section>

              {tc.notes && (
                <section>
                  <p className="text-text-muted font-semibold uppercase tracking-wider text-[10px] mb-1.5">
                    Notes
                  </p>
                  <p className="text-text-muted italic">{tc.notes}</p>
                </section>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Loading / empty states
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <div className="flex items-center justify-center h-full">
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

// ---------------------------------------------------------------------------
// Code viewer panel
// ---------------------------------------------------------------------------

function CodePanel({
  content,
  isLoading,
  color,
  placeholder,
}: {
  content?: string;
  isLoading: boolean;
  color: string;
  placeholder: string;
}) {
  if (isLoading) return <Spinner />;
  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted">
        <p className="text-sm">{placeholder}</p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-auto scrollbar-thin p-4">
      <pre className={`text-xs leading-relaxed whitespace-pre-wrap font-mono ${color}`}>
        {content}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results tab — summary stats + embedded Allure report iframe
// ---------------------------------------------------------------------------

function ResultsTab({ session, reportKey }: { session: PastSession; reportKey: number }) {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => {
    setIframeLoaded(false);
  }, [reportKey]);

  const { data: summary, isError: summaryError } = useQuery({
    queryKey: ["session-report-summary", session.session_id, reportKey],
    queryFn: () => getSessionReportSummary(session.session_id),
    retry: false,
  });

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
            <span className="ml-auto text-xs text-text-muted">
              {total} total · {passRate}% pass rate
              {session.execution_status && (
                <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  session.execution_status === "passed" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                }`}>
                  {session.execution_status}
                </span>
              )}
            </span>
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
            Report summary unavailable — install Allure CLI to enable:{" "}
            <code className="font-mono">npm install -g allure-commandline</code>
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
          src={`/api/v1/report/view/${session.session_id}/index.html`}
          title="Test Report"
          className="w-full h-full border-0"
          onLoad={() => setIframeLoaded(true)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date formatting helper
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86_400_000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Main SessionViewer
// ---------------------------------------------------------------------------

type Tab = "manual" | "features" | "playwright" | "performance" | "results";

function downloadLoadScript(lt: LoadTest) {
  const blob = new Blob([lt.content], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${lt.name.replace(/\s+/g, "_").toLowerCase()}.js`;
  a.click();
  URL.revokeObjectURL(url);
}

function PerformanceViewTab({ loadTests }: { loadTests: LoadTest[] }) {
  const [selected, setSelected] = useState<LoadTest | null>(loadTests[0] ?? null);

  if (loadTests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted">
        <Activity size={32} className="opacity-30" />
        <p className="text-sm">No load scripts were generated in this session.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left — load test list */}
      <div className="w-56 flex-shrink-0 border-r border-border flex flex-col">
        <div className="px-3 py-2 border-b border-border flex-shrink-0">
          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Load Scripts</span>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
          {loadTests.map((lt) => (
            <button
              key={lt.id}
              onClick={() => setSelected(lt)}
              className={[
                "w-full text-left px-2.5 py-2 rounded-lg border transition-all",
                selected?.id === lt.id
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
                  onClick={(e) => { e.stopPropagation(); downloadLoadScript(lt); }}
                  className="text-text-muted hover:text-accent transition-colors flex-shrink-0"
                  title="Download"
                >
                  <Download size={11} />
                </button>
              </div>
              <p className="text-[10px] text-text-muted mt-0.5 pl-3">{lt.vus} VUs · {lt.duration}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Right — script preview */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        {selected ? (
          <>
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border flex-shrink-0">
              <span className="text-xs font-mono text-text-muted truncate flex-1">{selected.name}.js</span>
              <button
                onClick={() => downloadLoadScript(selected)}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors"
              >
                <Download size={12} /> Download
              </button>
            </div>
            <pre className="flex-1 overflow-auto scrollbar-thin text-[11px] font-mono leading-relaxed text-text-primary bg-surface p-4 m-0 whitespace-pre">
              {selected.content}
            </pre>
          </>
        ) : null}
      </div>
    </div>
  );
}

interface Props {
  session: PastSession;
}

export default function SessionViewer({ session }: Props) {
  const { setViewingSession } = useSessionStore();
  const [tab, setTab] = useState<Tab>("manual");
  const [reportKey, setReportKey] = useState(0);
  const [isRerunning, setIsRerunning] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);
  const prevExecStatus = useRef<string | null>(null);
  const queryClient = useQueryClient();

  // Poll execution status while re-running
  const { data: execStatus } = useQuery({
    queryKey: ["session-exec-status", session.session_id],
    queryFn: () => getSessionExecutionStatus(session.session_id),
    enabled: isRerunning,
    refetchInterval: isRerunning ? 2000 : false,
  });

  // Detect running → done transition
  useEffect(() => {
    if (!isRerunning) return;
    const status = execStatus?.execution_status;
    if (status && status !== "running") {
      setIsRerunning(false);
      setReportKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["session-exec-status", session.session_id] });
      prevExecStatus.current = status;
    }
  }, [execStatus, isRerunning, queryClient, session.session_id]);

  const handleRerun = async () => {
    if (isRerunning) return;
    setRerunError(null);
    try {
      await reExecuteSession(session.session_id);
      setIsRerunning(true);
      setTab("results");
    } catch {
      setRerunError("Failed to start re-execution. Please try again.");
    }
  };

  const testCasesQuery = useQuery({
    queryKey: ["past-test-cases", session.session_id],
    queryFn: () => getSessionTestCases(session.session_id),
    enabled: tab === "manual",
    retry: false,
  });

  const featureQuery = useQuery({
    queryKey: ["past-feature-files", session.session_id],
    queryFn: () => getSessionFeatureFiles(session.session_id),
    enabled: tab === "features" && session.has_feature_files,
    retry: false,
  });

  const playwrightQuery = useQuery({
    queryKey: ["past-playwright", session.session_id],
    queryFn: () => getSessionPlaywrightTest(session.session_id),
    enabled: tab === "playwright" && session.has_playwright,
    retry: false,
  });

  const loadTestsQuery = useQuery({
    queryKey: ["past-load-tests", session.session_id],
    queryFn: () => getSessionLoadTests(session.session_id),
    enabled: tab === "performance" && session.has_load_tests,
    retry: false,
  });

  const testCases = testCasesQuery.data?.test_cases ?? [];
  const loadTests = loadTestsQuery.data?.load_tests ?? [];

  return (
    <div className="flex-1 overflow-hidden flex flex-col animate-fade-in">
      {/* ── Header bar ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
        <button
          onClick={() => setViewingSession(null)}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <div className="h-4 w-px bg-border flex-shrink-0" />
        <span className="text-text-primary text-sm font-medium truncate flex-1">
          {session.filename}
        </span>
        <span className="text-xs text-text-muted flex-shrink-0">
          {formatDate(session.updated_at)}
        </span>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center border-b border-border flex-shrink-0">
        {/* Manual Test Cases */}
        <button
          onClick={() => setTab("manual")}
          className={`px-4 py-2.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
            tab === "manual"
              ? "text-accent border-b-2 border-accent -mb-px"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          <ClipboardList size={13} />
          Manual Test Cases
          {testCases.length > 0 && (
            <span className="text-[10px] bg-accent text-white px-1.5 py-0.5 rounded-full font-medium">
              {testCases.length}
            </span>
          )}
        </button>

        {/* Feature Files */}
        <button
          onClick={() => session.has_feature_files && setTab("features")}
          disabled={!session.has_feature_files}
          title={!session.has_feature_files ? "Not generated in this session" : undefined}
          className={`px-4 py-2.5 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
            tab === "features"
              ? "text-text-primary border-b-2 border-text-primary -mb-px"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          <Code2 size={13} />
          Feature Files
        </button>

        {/* Playwright Tests */}
        <button
          onClick={() => session.has_playwright && setTab("playwright")}
          disabled={!session.has_playwright}
          title={!session.has_playwright ? "Not generated in this session" : undefined}
          className={`px-4 py-2.5 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
            tab === "playwright"
              ? "text-text-primary border-b-2 border-text-primary -mb-px"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          <FileCode2 size={13} />
          Playwright Tests
        </button>

        {/* Performance / Load Scripts */}
        <button
          onClick={() => session.has_load_tests && setTab("performance")}
          disabled={!session.has_load_tests}
          title={!session.has_load_tests ? "No load scripts generated in this session" : undefined}
          className={`px-4 py-2.5 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
            tab === "performance"
              ? "text-text-primary border-b-2 border-text-primary -mb-px"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          <Activity size={13} />
          Performance
        </button>

        {/* Results (only if tests were executed) */}
        <button
          onClick={() => (session.has_execution || isRerunning) && setTab("results")}
          disabled={!session.has_execution && !isRerunning}
          title={!session.has_execution && !isRerunning ? "Tests not run in this session" : undefined}
          className={`px-4 py-2.5 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
            tab === "results"
              ? "text-text-primary border-b-2 border-text-primary -mb-px"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          <BarChart2 size={13} />
          Results
          {isRerunning ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-warning/20 text-warning">
              running…
            </span>
          ) : session.has_execution && session.execution_status ? (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              session.execution_status === "passed" ? "bg-success/20 text-success" : "bg-danger/20 text-danger"
            }`}>
              {session.execution_status}
            </span>
          ) : null}
        </button>

        {/* Re-run button — visible when Playwright tests exist */}
        {session.has_playwright && (
          <div className="ml-auto px-3 py-2 flex-shrink-0">
            <button
              onClick={handleRerun}
              disabled={isRerunning}
              className="flex items-center gap-1.5 bg-card border border-border text-text-muted text-xs font-medium px-3 py-1.5 rounded-lg hover:text-text-secondary hover:border-accent/30 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={13} className={isRerunning ? "animate-spin" : ""} />
              {isRerunning ? "Running…" : "Re-run Tests"}
            </button>
          </div>
        )}
      </div>
      {rerunError && (
        <p className="text-xs text-danger px-4 py-1 border-b border-border">{rerunError}</p>
      )}

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === "manual" && (
          <>
            {testCasesQuery.isLoading ? (
              <Spinner />
            ) : testCases.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted">
                <ClipboardList size={32} className="opacity-30" />
                <p className="text-sm">
                  {testCasesQuery.isError
                    ? "Test cases not available — they may not have been approved in this session."
                    : "No test cases found for this session."}
                </p>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Sub-header */}
                <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-shrink-0">
                  <ClipboardList size={16} className="text-accent" />
                  <span className="text-sm font-semibold text-text-primary">Test Cases</span>
                  <span className="text-xs text-white bg-accent px-2 py-0.5 rounded-full font-medium">
                    {testCases.length}
                  </span>
                  <span className="text-xs text-green-400 ml-auto">
                    {testCases.filter((t) => t.test_type === "Functional").length} functional
                  </span>
                  <span className="text-xs text-purple-400">
                    {testCases.filter((t) => t.test_type === "Negative").length} negative
                  </span>
                  <span className="text-xs text-pink-400">
                    {testCases.filter((t) => t.test_type === "Edge Case").length} edge
                  </span>
                </div>
                {/* Table */}
                <div className="flex-1 overflow-auto scrollbar-thin">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-surface z-10">
                      <tr className="border-b border-border">
                        <th className="w-8 px-3 py-2.5" />
                        <th className="px-2 py-2.5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">ID</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">Title</th>
                        <th className="px-2 py-2.5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">Type</th>
                        <th className="px-2 py-2.5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">Priority</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">Endpoint</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testCases.map((tc) => (
                        <TestCaseRow key={tc.id} tc={tc} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "features" && (
          <CodePanel
            content={featureQuery.data?.content}
            isLoading={featureQuery.isLoading}
            color="text-text-primary"
            placeholder="Feature files not available for this session."
          />
        )}

        {tab === "playwright" && (
          <CodePanel
            content={playwrightQuery.data?.content}
            isLoading={playwrightQuery.isLoading}
            color="text-text-primary"
            placeholder="Playwright tests not available for this session."
          />
        )}

        {tab === "performance" && session.has_load_tests && (
          loadTestsQuery.isLoading ? (
            <Spinner />
          ) : (
            <PerformanceViewTab loadTests={loadTests} />
          )
        )}

        {tab === "results" && (session.has_execution || isRerunning) && (
          isRerunning ? (
            <div className="flex flex-1 items-center justify-center h-full">
              <div className="text-center space-y-3">
                <div className="flex gap-1.5 justify-center">
                  {[0, 150, 300].map((d) => (
                    <span
                      key={d}
                      className="w-2.5 h-2.5 bg-accent rounded-full animate-bounce"
                      style={{ animationDelay: `${d}ms` }}
                    />
                  ))}
                </div>
                <p className="text-sm font-semibold text-text-primary">Running tests…</p>
                <p className="text-xs text-text-muted">This may take a few minutes.</p>
              </div>
            </div>
          ) : (
            <ResultsTab session={session} reportKey={reportKey} />
          )
        )}
      </div>
    </div>
  );
}
