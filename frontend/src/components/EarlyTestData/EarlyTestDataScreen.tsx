import { Download, FileSpreadsheet, RefreshCw, SkipForward, Sparkles, Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { downloadGeneratedTestData, generateTestData, skipEarlyTestData, uploadEarlyTestData } from "@/api/chat";
import type { GeneratedTestData } from "@/api/chat";

interface Props {
  threadId: string;
  onSkipped: () => void;
  onUploaded: (rowsLoaded: number, message: string) => void;
}

const ACCEPTED = {
  "text/csv": [".csv"],
  "application/json": [".json"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/octet-stream": [".csv", ".xlsx"],
};

// ── Full scrollable preview of all generated rows ────────────────────────────

function DataPreview({ result, threadId }: { result: GeneratedTestData; threadId: string }) {
  const [downloading, setDownloading] = useState(false);

  const columns = result.column_names.length > 0
    ? result.column_names
    : result.data.length > 0 ? Object.keys(result.data[0]) : [];

  if (columns.length === 0) return null;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadGeneratedTestData(threadId);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Scrollable body — header stays sticky */}
        <div className="max-h-64 overflow-y-auto scrollbar-thin">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-card border-b border-border">
                <th className="px-3 py-2 text-left font-semibold text-text-muted w-8">#</th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2 text-left font-semibold text-text-muted whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.data.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-card/50">
                  <td className="px-3 py-2 text-text-muted font-mono">{i + 1}</td>
                  {columns.map((col) => (
                    <td
                      key={col}
                      className="px-3 py-2 text-text-secondary truncate max-w-[160px]"
                      title={row[col] ?? ""}
                    >
                      {row[col] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Footer with row count */}
        <div className="px-3 py-1.5 bg-surface border-t border-border flex items-center justify-between">
          <span className="text-[10px] text-text-muted">
            {result.data.length} row{result.data.length !== 1 ? "s" : ""} · {columns.length} column{columns.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-accent disabled:opacity-50 transition-colors"
          >
            <Download size={11} />
            {downloading ? "Downloading…" : "Download Excel"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function EarlyTestDataScreen({ threadId, onSkipped, onUploaded }: Props) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const [nRows, setNRows] = useState(6);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<GeneratedTestData | null>(null);

  const busy = uploading || skipping || generating;

  // ── Upload handler ──────────────────────────────────────────────────────────
  const onDrop = useCallback(
    async (accepted: File[]) => {
      if (!accepted.length) return;
      setUploadError(null);
      setGeneratedResult(null);
      setUploading(true);
      try {
        const res = await uploadEarlyTestData(threadId, accepted[0]);
        onUploaded(res.rows_loaded, res.message);
      } catch (e: unknown) {
        setUploadError(e instanceof Error ? e.message : "Upload failed. Check file format and try again.");
      } finally {
        setUploading(false);
      }
    },
    [threadId, onUploaded],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    disabled: busy,
  });

  // ── Generate from spec ──────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerateError(null);
    setGeneratedResult(null);
    setGenerating(true);
    try {
      const res = await generateTestData(threadId, nRows);
      setGeneratedResult(res);
    } catch (e: unknown) {
      setGenerateError(e instanceof Error ? e.message : "Generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleUseGenerated = async () => {
    if (!generatedResult || busy) return;
    setSkipping(true);
    try {
      // Test data is already in graph state (stored by /generate-test-data).
      // Calling skip-early-data resumes the graph at interrupt_before=["generate_test_cases"].
      await skipEarlyTestData(threadId);
      onUploaded(generatedResult.rows_generated, generatedResult.message);
    } catch {
      setUploadError("Failed to start test case generation. Please try again.");
      setSkipping(false);
    }
  };

  // ── Skip ────────────────────────────────────────────────────────────────────
  const handleSkip = async () => {
    setSkipping(true);
    try {
      await skipEarlyTestData(threadId);
      onSkipped();
    } catch {
      setUploadError("Failed to skip. Please try again.");
      setSkipping(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center bg-surface p-6 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl p-8 max-w-2xl w-full shadow-sm space-y-6 my-auto">

        {/* Header */}
        <div>
          <h2 className="text-base font-semibold text-text-primary">Provide Test Data</h2>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">
            Test data lets the generator use realistic values in assertions instead of placeholders.
            Upload a file, let AI generate it from your API spec, or skip for now.
          </p>
        </div>

        {/* ── Two side-by-side options ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

          {/* Option 1 — Upload */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Upload a file</p>
            <div
              {...getRootProps()}
              className={[
                "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all flex-1",
                isDragActive ? "border-accent bg-accent/5 scale-[1.01]" : "border-border hover:border-accent/50 hover:bg-surface",
                busy ? "opacity-60 cursor-not-allowed" : "",
              ].join(" ")}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-2.5">
                {uploading ? (
                  <div className="flex gap-1.5">
                    {[0, 150, 300].map((d) => (
                      <span
                        key={d}
                        className="w-2 h-2 bg-accent rounded-full animate-bounce"
                        style={{ animationDelay: `${d}ms` }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                    {isDragActive
                      ? <Upload size={18} className="text-accent" />
                      : <FileSpreadsheet size={18} className="text-accent" />}
                  </div>
                )}
                <div>
                  <p className="text-text-primary font-medium text-sm">
                    {uploading ? "Uploading…" : isDragActive ? "Drop it here" : "Drop file here"}
                  </p>
                  <p className="text-text-muted text-[11px] mt-0.5">CSV · Excel · JSON — each row = one scenario</p>
                </div>
                {!busy && (
                  <button className="text-accent text-xs font-medium border border-accent/30 px-2.5 py-1 rounded-lg hover:bg-accent/10 transition-colors">
                    Browse
                  </button>
                )}
              </div>
            </div>
            {uploadError && <p className="text-danger text-xs">{uploadError}</p>}
          </div>

          {/* Option 2 — Generate from API spec */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Generate from API spec</p>
            <div className="border border-border rounded-xl p-5 flex flex-col gap-3 flex-1 bg-surface">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Sparkles size={18} className="text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">AI-powered generation</p>
                <p className="text-[12px] text-text-secondary mt-1 leading-relaxed">
                  Analyzes your API endpoints and payload schemas to create realistic, diverse test data automatically.
                </p>
              </div>

              {/* Row count input */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted whitespace-nowrap">Number of rows</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={nRows}
                  onChange={(e) => setNRows(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                  disabled={busy}
                  className="w-16 text-xs text-text-primary bg-card border border-border rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                />
                <span className="text-[11px] text-text-muted">(1 – 50)</span>
              </div>

              {!generating && !generatedResult && (
                <button
                  onClick={handleGenerate}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm font-medium px-4 py-2 rounded-lg hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
                >
                  <Sparkles size={14} />
                  Generate Test Data
                </button>
              )}

              {generating && (
                <div className="flex flex-col items-center gap-2 py-2">
                  <div className="flex gap-1.5">
                    {[0, 150, 300].map((d) => (
                      <span
                        key={d}
                        className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${d}ms` }}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-text-muted">Analyzing API spec and generating {nRows} rows…</p>
                </div>
              )}

              {generateError && (
                <div className="space-y-2">
                  <p className="text-danger text-xs">{generateError}</p>
                  <button
                    onClick={handleGenerate}
                    disabled={busy}
                    className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
                  >
                    <RefreshCw size={12} />
                    Try again
                  </button>
                </div>
              )}

              {/* Regenerate button shown after first result */}
              {generatedResult && !generating && (
                <button
                  onClick={handleGenerate}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 border border-border text-text-muted text-xs font-medium px-3 py-1.5 rounded-lg hover:text-text-secondary hover:border-accent/30 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={12} />
                  Regenerate ({nRows} rows)
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Generated data review — full scrollable table with download */}
        {generatedResult && (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-xs font-semibold text-text-primary">
              Review generated data
              <span className="text-text-muted font-normal ml-1.5">— {generatedResult.rows_generated} rows</span>
            </p>

            <DataPreview result={generatedResult} threadId={threadId} />

            <button
              onClick={handleUseGenerated}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50 transition-colors shadow-sm"
            >
              <Sparkles size={14} />
              Use This Data
            </button>
          </div>
        )}

        {/* Skip */}
        <div className="flex justify-end border-t border-border pt-2">
          <button
            onClick={handleSkip}
            disabled={busy}
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50"
          >
            <SkipForward size={14} />
            {skipping ? "Skipping…" : "Skip, generate without test data"}
          </button>
        </div>
      </div>
    </div>
  );
}
