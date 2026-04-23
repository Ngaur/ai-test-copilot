import { BookOpen, FileJson, FlaskConical, Loader2, Ticket, Upload, X, Zap } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { startSession, uploadContextDoc, uploadDocument } from "@/api/chat";
import { fetchJiraTickets } from "@/api/settings";

interface Props {
  onStarted: (sessionId: string, filename: string, threadId: string) => void;
}

const SPEC_ACCEPT = {
  "application/json": [".json"],
  "application/x-yaml": [".yaml", ".yml"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "text/plain": [".txt", ".md"],
};

const CONTEXT_ACCEPT = {
  "text/plain": [".txt", ".md"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

const FEATURES = [
  { icon: FileJson, label: "Postman & OpenAPI collections" },
  { icon: Ticket, label: "Jira context enrichment" },
  { icon: Zap, label: "Playwright automation generation" },
];

export default function UploadScreen({ onStarted }: Props) {
  const [specFile, setSpecFile] = useState<File | null>(null);
  const [contextFiles, setContextFiles] = useState<File[]>([]);
  const [jiraInput, setJiraInput] = useState("");
  const [jiraFetched, setJiraFetched] = useState<string[]>([]);
  const [fetchingJira, setFetchingJira] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDropSpec = useCallback((accepted: File[]) => {
    if (accepted.length) setSpecFile(accepted[0]);
  }, []);

  const onDropContext = useCallback((accepted: File[]) => {
    setContextFiles((prev) => [...prev, ...accepted]);
  }, []);

  const specDropzone = useDropzone({
    onDrop: onDropSpec,
    accept: SPEC_ACCEPT,
    maxFiles: 1,
    disabled: isSubmitting,
  });

  const contextDropzone = useDropzone({
    onDrop: onDropContext,
    accept: CONTEXT_ACCEPT,
    multiple: true,
    disabled: isSubmitting,
  });

  const removeContextFile = (index: number) => {
    setContextFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFetchJira = async () => {
    const keys = jiraInput
      .split(/[\s,]+/)
      .map((k) => k.trim().toUpperCase())
      .filter(Boolean);
    if (!keys.length) return;
    setJiraError(null);
    setFetchingJira(true);
    // We need a session_id to fetch Jira, but we haven't uploaded yet.
    // Upload the spec first, then fetch Jira, then start session.
    // For now, show a note that Jira tickets will be fetched after upload.
    try {
      // Store the keys — they'll be fetched after spec upload in handleSubmit
      setJiraFetched(keys);
      setJiraInput("");
    } finally {
      setFetchingJira(false);
    }
  };

  const handleSubmit = async () => {
    if (!specFile) return;
    setError(null);
    setIsSubmitting(true);
    try {
      // 1. Upload spec
      const uploaded = await uploadDocument(specFile);
      const { session_id, filename } = uploaded;

      // 2. Upload context files
      for (const file of contextFiles) {
        await uploadContextDoc(session_id, file);
      }

      // 3. Fetch Jira tickets (if any IDs were staged)
      if (jiraFetched.length > 0) {
        try {
          await fetchJiraTickets(session_id, jiraFetched);
        } catch {
          // Non-fatal — log but continue
          console.warn("Jira fetch failed, continuing without Jira context");
        }
      }

      // 4. Start analysis
      const res = await startSession(session_id);
      onStarted(session_id, filename, res.thread_id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8 py-10 bg-surface">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center">
            <FlaskConical className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">APITests.ai</h1>
        </div>
        <p className="text-text-secondary max-w-sm text-sm">
          Upload your API spec to automatically generate comprehensive manual and automated test cases.
        </p>
      </div>

      {/* Upload card */}
      <div className="w-full max-w-lg flex flex-col gap-5">

        {/* ── Spec file (required) ── */}
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
            API Specification <span className="text-danger">*</span>
          </p>
          {specFile ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-accent/30 bg-accent/5">
              <FileJson className="h-4 w-4 text-accent shrink-0" />
              <span className="text-sm text-text-primary flex-1 truncate">{specFile.name}</span>
              {!isSubmitting && (
                <button
                  onClick={() => setSpecFile(null)}
                  className="text-text-muted hover:text-danger transition-colors"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <div
              {...specDropzone.getRootProps()}
              className={[
                "rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200",
                specDropzone.isDragActive
                  ? "border-accent bg-accent/8 scale-[1.01]"
                  : "border-border bg-card hover:border-accent/50 hover:bg-accent/5 hover:shadow-md",
                isSubmitting ? "opacity-60 cursor-not-allowed" : "",
              ].join(" ")}
            >
              <input {...specDropzone.getInputProps()} />
              <div className="flex flex-col items-center gap-3">
                <div className={[
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200",
                  specDropzone.isDragActive ? "bg-accent/15" : "bg-surface",
                ].join(" ")}>
                  {specDropzone.isDragActive
                    ? <Upload className="h-6 w-6 text-accent" />
                    : <FileJson className="h-6 w-6 text-text-muted" />
                  }
                </div>
                <div>
                  <p className="text-text-primary font-semibold text-sm">
                    {specDropzone.isDragActive ? "Drop your spec here" : "Drag & drop your API spec"}
                  </p>
                  <p className="text-text-secondary text-xs mt-0.5">
                    Postman (.json) · OpenAPI (.yaml/.json) · PDF · DOCX
                  </p>
                </div>
                <button className="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors shadow-sm">
                  Browse files
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Context documents (optional) ── */}
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
            Context Documents
            <span className="ml-1.5 font-normal normal-case tracking-normal text-text-muted">
              (optional — business rules, feature specs, README…)
            </span>
          </p>

          {contextFiles.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-2">
              {contextFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border bg-surface"
                >
                  <BookOpen className="h-3.5 w-3.5 text-text-muted shrink-0" />
                  <span className="text-sm text-text-secondary flex-1 truncate">{f.name}</span>
                  {!isSubmitting && (
                    <button
                      onClick={() => removeContextFile(i)}
                      className="text-text-muted hover:text-danger transition-colors"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div
            {...contextDropzone.getRootProps()}
            className={[
              "rounded-xl border border-dashed px-6 py-4 text-center cursor-pointer transition-all duration-200",
              contextDropzone.isDragActive
                ? "border-accent/60 bg-accent/5"
                : "border-border bg-surface/50 hover:border-accent/30",
              isSubmitting ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
          >
            <input {...contextDropzone.getInputProps()} />
            <div className="flex items-center justify-center gap-3">
              <BookOpen className={[
                "h-4 w-4 shrink-0",
                contextDropzone.isDragActive ? "text-accent" : "text-text-muted",
              ].join(" ")} />
              <p className="text-text-secondary text-sm">
                {contextDropzone.isDragActive
                  ? "Drop files here"
                  : contextFiles.length === 0
                    ? "Drop .md · .txt · .pdf · .docx files or click to browse"
                    : "Add more context files"}
              </p>
            </div>
          </div>
        </div>

        {/* ── Jira ticket IDs (optional) ── */}
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
            Jira Ticket IDs
            <span className="ml-1.5 font-normal normal-case tracking-normal text-text-muted">
              (optional — comma-separated)
            </span>
          </p>

          {jiraFetched.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {jiraFetched.map((key) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-surface text-xs text-text-secondary"
                >
                  <Ticket className="h-3 w-3 text-text-muted" />
                  {key}
                  <button
                    onClick={() => setJiraFetched((prev) => prev.filter((k) => k !== key))}
                    className="text-text-muted hover:text-danger transition-colors ml-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={jiraInput}
              onChange={(e) => { setJiraInput(e.target.value); setJiraError(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleFetchJira()}
              placeholder="e.g. PROJ-123, PROJ-456"
              disabled={fetchingJira || isSubmitting}
              className="flex-1 bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 transition-colors disabled:opacity-60"
            />
            <button
              onClick={handleFetchJira}
              disabled={!jiraInput.trim() || fetchingJira || isSubmitting}
              className="flex items-center gap-1.5 text-sm border border-border px-4 py-2.5 rounded-xl text-text-secondary hover:text-text-primary hover:border-accent/40 disabled:opacity-50 transition-colors flex-shrink-0 bg-card"
            >
              {fetchingJira
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Ticket className="h-3.5 w-3.5" />
              }
              Add
            </button>
          </div>
          {jiraError && <p className="text-danger text-xs mt-1.5">{jiraError}</p>}
        </div>

        {/* ── Submit ── */}
        {error && (
          <p className="text-danger text-sm bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
            {error}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!specFile || isSubmitting}
          className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors shadow-sm"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading & starting…
            </span>
          ) : (
            "Start Analysis →"
          )}
        </button>
      </div>

      {/* Feature hints */}
      <div className="flex flex-col sm:flex-row items-center gap-6 text-sm">
        {FEATURES.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 text-text-muted">
            <Icon className="h-4 w-4 text-accent/70 shrink-0" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
