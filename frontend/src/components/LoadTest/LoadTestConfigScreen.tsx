import { Activity, CheckSquare, ChevronRight, Download, Plus, RefreshCw, SkipForward, Sparkles, Square } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { generateLoadTest, getTestCases, skipLoadTest } from "@/api/chat";
import type { LoadTest, LoadTestConfig } from "@/types";

interface Props {
  threadId: string;
  onDone: () => void;
}

function defaultConfig(index: number): LoadTestConfig {
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

// ── Left-panel card for a generated load test ────────────────────────────────

function LoadTestCard({
  lt,
  selected,
  onSelect,
  onDownload,
}: {
  lt: LoadTest;
  selected: boolean;
  onSelect: () => void;
  onDownload: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={[
        "w-full text-left px-3 py-3 rounded-xl border transition-all",
        selected
          ? "border-accent/50 bg-accent/5"
          : "border-border hover:border-accent/30 hover:bg-card",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
            <span className="text-xs font-semibold text-text-primary truncate">{lt.name}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {lt.endpoints.map((ep) => (
              <span
                key={ep}
                className="text-[10px] font-mono text-text-muted bg-surface border border-border px-1.5 py-0.5 rounded truncate max-w-[160px]"
                title={ep}
              >
                {ep}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-text-muted mt-1.5">
            {lt.vus} VUs · {lt.duration}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDownload(); }}
          className="flex-shrink-0 text-text-muted hover:text-accent transition-colors p-1 rounded"
          title="Download script"
        >
          <Download size={13} />
        </button>
      </div>
    </button>
  );
}

// ── Config form (right pane) ─────────────────────────────────────────────────

function ConfigForm({
  config,
  onChange,
  uniqueEndpoints,
  generating,
  generateError,
  onGenerate,
}: {
  config: LoadTestConfig;
  onChange: (c: LoadTestConfig) => void;
  uniqueEndpoints: string[];
  generating: boolean;
  generateError: string | null;
  onGenerate: () => void;
}) {
  const allSelected = config.selectedEndpoints.length === uniqueEndpoints.length && uniqueEndpoints.length > 0;

  const toggleEndpoint = (ep: string) => {
    if (config.selectedEndpoints.includes(ep)) {
      onChange({ ...config, selectedEndpoints: config.selectedEndpoints.filter((e) => e !== ep) });
    } else {
      onChange({ ...config, selectedEndpoints: [...config.selectedEndpoints, ep] });
    }
  };

  const toggleAll = () => {
    onChange({ ...config, selectedEndpoints: allSelected ? [] : [...uniqueEndpoints] });
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-5 space-y-5">
      {/* Name */}
      <div>
        <label className="text-xs font-semibold text-text-muted uppercase tracking-wider block mb-1.5">
          Load Test Name
        </label>
        <input
          type="text"
          value={config.name}
          onChange={(e) => onChange({ ...config, name: e.target.value })}
          disabled={generating}
          className="w-full text-sm text-text-primary bg-card border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
        />
      </div>

      {/* Endpoint selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            Select API Endpoints
          </label>
          <button
            onClick={toggleAll}
            disabled={generating || uniqueEndpoints.length === 0}
            className="flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover disabled:opacity-40 transition-colors"
          >
            {allSelected ? <CheckSquare size={12} /> : <Square size={12} />}
            {allSelected ? "Deselect All" : "Select All"}
          </button>
        </div>
        <div className="border border-border rounded-xl overflow-hidden">
          {uniqueEndpoints.length === 0 ? (
            <p className="px-3 py-4 text-xs text-text-muted text-center">No endpoints found.</p>
          ) : (
            uniqueEndpoints.map((ep, i) => (
              <label
                key={ep}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors",
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
                <span className="text-xs font-mono text-text-primary flex-1 truncate" title={ep}>{ep}</span>
              </label>
            ))
          )}
        </div>
        {config.selectedEndpoints.length > 0 && (
          <p className="text-[11px] text-text-muted mt-1.5">
            {config.selectedEndpoints.length} endpoint{config.selectedEndpoints.length !== 1 ? "s" : ""} selected
            {config.selectedEndpoints.length > 1 ? " — will run sequentially" : ""}
          </p>
        )}
      </div>

      {/* Load profile */}
      <div>
        <label className="text-xs font-semibold text-text-muted uppercase tracking-wider block mb-2.5">
          Load Profile
        </label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Virtual Users", key: "vus" as const, type: "number", min: 1, max: 500 },
            { label: "Duration", key: "duration" as const, type: "text", placeholder: "e.g. 2m" },
            { label: "Ramp-up", key: "rampUp" as const, type: "text", placeholder: "e.g. 30s" },
            { label: "Ramp-down", key: "rampDown" as const, type: "text", placeholder: "e.g. 30s" },
          ].map(({ label, key, type, ...rest }) => (
            <div key={key}>
              <label className="text-[11px] text-text-muted block mb-1">{label}</label>
              <input
                type={type}
                value={config[key] as string | number}
                onChange={(e) =>
                  onChange({ ...config, [key]: type === "number" ? parseInt(e.target.value) || 1 : e.target.value })
                }
                disabled={generating}
                className="w-full text-xs text-text-primary bg-card border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                {...rest}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Thresholds */}
      <div>
        <label className="text-xs font-semibold text-text-muted uppercase tracking-wider block mb-2.5">
          Latency Thresholds
        </label>
        <div className="space-y-2">
          {[
            { label: "p95 response time (ms)", key: "p95Ms" as const },
            { label: "p99 response time (ms)", key: "p99Ms" as const },
            { label: "Error rate (%)", key: "errorRatePct" as const },
          ].map(({ label, key }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs text-text-muted w-44 flex-shrink-0">{label} &lt;</span>
              <input
                type="number"
                min={0}
                value={config[key]}
                onChange={(e) => onChange({ ...config, [key]: parseFloat(e.target.value) || 0 })}
                disabled={generating}
                className="w-24 text-xs text-text-primary bg-card border border-border rounded-lg px-2.5 py-1.5 text-right focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Generate button */}
      {generateError && <p className="text-xs text-danger">{generateError}</p>}
      <button
        onClick={onGenerate}
        disabled={generating || config.selectedEndpoints.length === 0}
        className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50 transition-colors shadow-sm"
      >
        {generating ? (
          <>
            <RefreshCw size={14} className="animate-spin" />
            Generating script…
          </>
        ) : (
          <>
            <Sparkles size={14} />
            Generate Load Script
          </>
        )}
      </button>
    </div>
  );
}

// ── Script preview (right pane) ──────────────────────────────────────────────

function ScriptPreview({ lt, onBack }: { lt: LoadTest; onBack: () => void }) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          <ChevronRight size={12} className="rotate-180" />
          Back to config
        </button>
        <span className="text-xs font-mono text-text-muted truncate flex-1">{lt.name}.js</span>
        <button
          onClick={() => downloadScript(lt)}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors"
        >
          <Download size={12} />
          Download
        </button>
      </div>
      <pre className="flex-1 overflow-auto scrollbar-thin text-[11px] font-mono leading-relaxed text-text-primary bg-surface p-4 m-0 whitespace-pre">
        {lt.content}
      </pre>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function LoadTestConfigScreen({ threadId, onDone }: Props) {
  const [loadTests, setLoadTests] = useState<LoadTest[]>([]);
  const [rightMode, setRightMode] = useState<"config" | "preview">("config");
  const [previewTarget, setPreviewTarget] = useState<LoadTest | null>(null);
  const [config, setConfig] = useState<LoadTestConfig>(defaultConfig(1));
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [nextIndex, setNextIndex] = useState(2);
  const [skipping, setSkipping] = useState(false);

  const { data: tcData } = useQuery({
    queryKey: ["test-cases", threadId],
    queryFn: () => getTestCases(threadId),
  });

  const uniqueEndpoints = useMemo(() => {
    const tcs = tcData?.test_cases ?? [];
    return [...new Set(tcs.map((tc) => tc.endpoint).filter(Boolean))].sort();
  }, [tcData]);

  const handleGenerate = useCallback(async () => {
    if (!config.selectedEndpoints.length || generating) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const lt = await generateLoadTest(threadId, config);
      const updated = [...loadTests, lt];
      setLoadTests(updated);
      setPreviewTarget(lt);
      setRightMode("preview");
      setConfig(defaultConfig(nextIndex));
      setNextIndex((n) => n + 1);
    } catch (e: unknown) {
      setGenerateError(e instanceof Error ? e.message : "Generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [config, generating, loadTests, nextIndex, threadId]);

  const handleAddNew = () => {
    setRightMode("config");
    setPreviewTarget(null);
  };

  const handleDone = async () => {
    setSkipping(true);
    try {
      await skipLoadTest(threadId);
      onDone();
    } catch {
      setSkipping(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center bg-surface p-6 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl shadow-sm w-full max-w-5xl flex flex-col my-auto" style={{ maxHeight: "90vh" }}>

        {/* Header */}
        <div className="px-8 py-5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
              <Activity size={16} className="text-accent" />
            </div>
            <h2 className="text-base font-semibold text-text-primary">Create Performance Load Scripts</h2>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">
            Select API endpoints and generate load test scripts. You can create multiple scripts with different API combinations.
          </p>
        </div>

        {/* Two-pane body */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Left pane — list */}
          <div className="w-64 flex-shrink-0 border-r border-border flex flex-col">
            <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
              {loadTests.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-text-muted px-2">
                  <Activity size={24} className="opacity-30" />
                  <p className="text-xs text-center">No load scripts yet. Configure and generate one on the right.</p>
                </div>
              ) : (
                loadTests.map((lt) => (
                  <LoadTestCard
                    key={lt.id}
                    lt={lt}
                    selected={previewTarget?.id === lt.id && rightMode === "preview"}
                    onSelect={() => { setPreviewTarget(lt); setRightMode("preview"); }}
                    onDownload={() => downloadScript(lt)}
                  />
                ))
              )}
            </div>
            <div className="p-3 border-t border-border flex-shrink-0">
              <button
                onClick={handleAddNew}
                disabled={generating}
                className="w-full flex items-center justify-center gap-1.5 border border-dashed border-border text-text-muted text-xs font-medium px-3 py-2 rounded-lg hover:border-accent/40 hover:text-text-secondary disabled:opacity-40 transition-colors"
              >
                <Plus size={13} />
                Add Load Test
              </button>
            </div>
          </div>

          {/* Right pane — config or preview */}
          <div className="flex-1 overflow-hidden flex flex-col min-w-0">
            {rightMode === "config" ? (
              <ConfigForm
                config={config}
                onChange={setConfig}
                uniqueEndpoints={uniqueEndpoints}
                generating={generating}
                generateError={generateError}
                onGenerate={handleGenerate}
              />
            ) : previewTarget ? (
              <ScriptPreview
                lt={previewTarget}
                onBack={handleAddNew}
              />
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-border flex items-center justify-between flex-shrink-0">
          <button
            onClick={handleDone}
            disabled={skipping || generating}
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50"
          >
            <SkipForward size={14} />
            {skipping ? "Continuing…" : loadTests.length === 0 ? "Skip, no load scripts" : "Skip remaining"}
          </button>
          <button
            onClick={handleDone}
            disabled={skipping || generating || loadTests.length === 0}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-5 py-2 rounded-xl disabled:opacity-40 transition-colors shadow-sm"
          >
            Continue
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
