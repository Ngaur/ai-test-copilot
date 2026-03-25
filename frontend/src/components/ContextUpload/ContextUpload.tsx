import { BookOpen, FileText, Loader2, PlayCircle, Plus, Ticket } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { uploadContextDoc } from "@/api/chat";
import { fetchJiraTickets } from "@/api/settings";

interface Props {
  sessionId: string;
  specFilename: string;
  onStart: () => void;
}

const ACCEPTED = {
  "text/plain": [".txt", ".md"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

export default function ContextUpload({ sessionId, specFilename, onStart }: Props) {
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jiraInput, setJiraInput] = useState("");
  const [fetchingJira, setFetchingJira] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      if (!accepted.length) return;
      setError(null);
      setUploading(true);
      try {
        for (const file of accepted) {
          await uploadContextDoc(sessionId, file);
          setContextFiles((prev) => [...prev, file.name]);
        }
      } catch {
        setError("Upload failed. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [sessionId]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    multiple: true,
    disabled: uploading || starting,
  });

  const handleFetchJira = async () => {
    const keys = jiraInput
      .split(/[\s,]+/)
      .map((k) => k.trim().toUpperCase())
      .filter(Boolean);
    if (!keys.length) return;
    setJiraError(null);
    setFetchingJira(true);
    try {
      const res = await fetchJiraTickets(sessionId, keys);
      if (res.fetched.length) {
        setContextFiles((prev) => [...prev, ...res.fetched.map((k) => `jira_${k}.txt`)]);
      }
      if (res.errors.length) {
        setJiraError(`Could not fetch: ${res.errors.join(", ")}`);
      }
      setJiraInput("");
    } catch {
      setJiraError("Failed to fetch Jira tickets. Check your Jira settings.");
    } finally {
      setFetchingJira(false);
    }
  };

  const handleStart = () => {
    setStarting(true);
    onStart();
  };

  return (
    <div className="mx-4 mb-3 rounded-xl border border-border bg-card p-4 animate-slide-in space-y-3">
      {/* Header */}
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <BookOpen size={13} className="text-accent" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">
            Add context documents <span className="text-text-muted font-normal">(optional)</span>
          </p>
          <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
            Attach feature specs, workflow guides, or API docs to generate more meaningful,
            business-aware test cases. The more context you give, the better the tests.
          </p>
        </div>
      </div>

      {/* Spec file badge */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border">
        <FileText size={13} className="text-accent flex-shrink-0" />
        <span className="text-xs text-text-primary truncate flex-1">{specFilename}</span>
        <span className="text-[10px] text-text-muted bg-accent/10 px-1.5 py-0.5 rounded font-medium">
          spec
        </span>
      </div>

      {/* Context files list */}
      {contextFiles.length > 0 && (
        <div className="space-y-1.5">
          {contextFiles.map((name) => (
            <div key={name} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border">
              <FileText size={13} className="text-text-muted flex-shrink-0" />
              <span className="text-xs text-text-primary truncate flex-1">{name}</span>
              <span className="text-[10px] text-text-muted bg-border px-1.5 py-0.5 rounded font-medium">
                context
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`border border-dashed rounded-lg px-3 py-2.5 flex items-center gap-2.5 cursor-pointer transition-all
          ${isDragActive ? "border-accent bg-accent/5" : "border-border hover:border-accent/40 hover:bg-surface/50"}
          ${uploading ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <Loader2 size={14} className="text-accent animate-spin flex-shrink-0" />
        ) : (
          <Plus size={14} className="text-text-muted flex-shrink-0" />
        )}
        <span className="text-xs text-text-muted">
          {uploading
            ? "Uploading..."
            : isDragActive
            ? "Drop files here"
            : "Add context docs — .md · .txt · .pdf · .docx"}
        </span>
      </div>

      {/* Jira ticket IDs */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Ticket size={12} className="text-text-muted flex-shrink-0" />
          <span className="text-xs text-text-secondary font-medium">Jira ticket IDs</span>
          <span className="text-[10px] text-text-muted">(optional, comma-separated)</span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={jiraInput}
            onChange={(e) => { setJiraInput(e.target.value); setJiraError(null); }}
            onKeyDown={(e) => e.key === "Enter" && handleFetchJira()}
            placeholder="e.g. PROJ-123, PROJ-456"
            disabled={fetchingJira || starting}
            className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 transition-colors disabled:opacity-60"
          />
          <button
            onClick={handleFetchJira}
            disabled={!jiraInput.trim() || fetchingJira || starting}
            className="flex items-center gap-1 text-xs border border-border px-3 py-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:border-accent/40 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {fetchingJira ? <Loader2 size={11} className="animate-spin" /> : <Ticket size={11} />}
            Fetch
          </button>
        </div>
        {jiraError && <p className="text-danger text-[11px]">{jiraError}</p>}
      </div>

      {error && <p className="text-danger text-xs">{error}</p>}

      {/* Actions */}
      <div className="flex items-center justify-between pt-0.5">
        <button
          onClick={handleStart}
          disabled={starting}
          className="flex items-center gap-1.5 bg-accent text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-accent-hover disabled:opacity-60 transition-colors shadow-sm"
        >
          {starting ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <PlayCircle size={13} />
          )}
          {starting ? "Starting..." : "Start Analysis"}
        </button>
        {contextFiles.length === 0 && (
          <button
            onClick={handleStart}
            disabled={starting}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50"
          >
            Skip, start without context →
          </button>
        )}
      </div>
    </div>
  );
}
