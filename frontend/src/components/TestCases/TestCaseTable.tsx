import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ClipboardList, Download } from "lucide-react";
import { useState } from "react";
import { downloadTestCases, getTestCases } from "@/api/chat";
import { useSessionStore } from "@/store/session";
import type { TestCase } from "@/types";

const PRIORITY_STYLES: Record<string, string> = {
  "P1-Critical": "bg-danger/15 text-danger border-danger/30",
  "P2-High":     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "P3-Medium":   "bg-warning/15 text-warning border-warning/30",
  "P4-Low":      "bg-text-muted/20 text-text-muted border-text-muted/30",
};

const TYPE_STYLES: Record<string, string> = {
  "Functional":   "bg-accent/15 text-accent border-accent/30",
  "Negative":     "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Edge Case":    "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "Security":     "bg-red-500/15 text-red-400 border-red-500/30",
  "Performance":  "bg-green-500/15 text-green-400 border-green-500/30",
};

function Badge({ label, styles }: { label: string; styles: Record<string, string> }) {
  const cls = styles[label] ?? "bg-card text-text-muted border-border";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cls}`}>
      {label}
    </span>
  );
}

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
        <tr className="border-b border-border bg-[#1a1a1a]">
          <td colSpan={6} className="px-5 py-4">
            <div className="space-y-3 text-xs">
              {tc.preconditions.length > 0 && (
                <section>
                  <p className="text-text-muted font-semibold uppercase tracking-wider text-[10px] mb-1.5">Preconditions</p>
                  <ul className="space-y-0.5">
                    {tc.preconditions.map((p, i) => (
                      <li key={i} className="flex gap-2 text-text-secondary">
                        <span className="text-text-muted mt-0.5">•</span>{p}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <p className="text-text-muted font-semibold uppercase tracking-wider text-[10px] mb-1.5">Steps</p>
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
                <p className="text-text-muted font-semibold uppercase tracking-wider text-[10px] mb-1.5">Expected Result</p>
                <p className="text-text-secondary">{tc.expected_result}</p>
              </section>

              {tc.notes && (
                <section>
                  <p className="text-text-muted font-semibold uppercase tracking-wider text-[10px] mb-1.5">Notes</p>
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

export default function TestCaseTable() {
  const { session } = useSessionStore();
  const threadId = session?.threadId;
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["test-cases", threadId],
    queryFn: () => getTestCases(threadId!),
    enabled: !!threadId,
    refetchInterval: () =>
      session?.status === "generating" || session?.status === "improving" ? 3000 : false,
  });

  const testCases = data?.test_cases ?? [];

  if (!threadId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted">
        <ClipboardList size={32} className="opacity-30" />
        <p className="text-sm">Test cases will appear here</p>
      </div>
    );
  }

  if (isLoading) {
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-accent" />
          <span className="text-sm font-semibold text-text-primary">Test Cases</span>
          {testCases.length > 0 && (
            <span className="text-xs text-white bg-accent px-2 py-0.5 rounded-full font-medium">
              {testCases.length}
            </span>
          )}
        </div>
        {testCases.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="text-green-400">{testCases.filter(t => t.test_type === "Functional").length} functional</span>
            <span className="text-purple-400">{testCases.filter(t => t.test_type === "Negative").length} negative</span>
            <span className="text-pink-400">{testCases.filter(t => t.test_type === "Edge Case").length} edge</span>
            <button
              onClick={async () => {
                setDownloading(true);
                try { await downloadTestCases(threadId!); }
                finally { setDownloading(false); }
              }}
              disabled={downloading}
              title="Download as Excel"
              className="flex items-center gap-1 text-text-muted hover:text-accent transition-colors disabled:opacity-50 ml-1"
            >
              <Download size={13} />
              <span>{downloading ? "Downloading..." : "Excel"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        {testCases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted">
            <p className="text-sm">
              {session?.status === "generating" ? "Generating test cases..." : "No test cases yet"}
            </p>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
