import { FileJson, Upload, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

interface Props {
  onUploaded: (sessionId: string, filename: string) => void;
  isLoading: boolean;
  compact?: boolean;
  onClose?: () => void;
}

const ACCEPTED = {
  "application/json": [".json"],
  "application/x-yaml": [".yaml", ".yml"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "text/plain": [".txt", ".md"],
};

export default function FileUpload({ onUploaded, isLoading, compact, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      if (!accepted.length) return;
      setError(null);
      setUploading(true);
      const file = accepted[0];
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch("/api/v1/documents/upload", { method: "POST", body: form });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        onUploaded(data.session_id, data.filename);
        onClose?.();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [onUploaded, onClose]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    disabled: isLoading || uploading,
  });

  if (compact) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-text-primary font-semibold">Upload File</p>
            <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
              <X size={18} />
            </button>
          </div>
          <DropZone getRootProps={getRootProps} getInputProps={getInputProps} isDragActive={isDragActive} uploading={uploading} />
          {error && <p className="text-danger text-xs mt-3">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg">
      <DropZone getRootProps={getRootProps} getInputProps={getInputProps} isDragActive={isDragActive} uploading={uploading} />
      {error && <p className="text-danger text-xs mt-3 text-center">{error}</p>}
    </div>
  );
}

function DropZone({ getRootProps, getInputProps, isDragActive, uploading }: {
  getRootProps: ReturnType<typeof useDropzone>["getRootProps"];
  getInputProps: ReturnType<typeof useDropzone>["getInputProps"];
  isDragActive: boolean;
  uploading: boolean;
}) {
  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
        ${isDragActive
          ? "border-accent bg-accent/5 scale-[1.01]"
          : "border-border hover:border-accent/50 hover:bg-card/50"
        }
        ${uploading ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-3">
        {uploading ? (
          <div className="flex gap-1.5">
            {[0, 150, 300].map((d) => (
              <span key={d} className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        ) : (
          <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            {isDragActive ? <Upload size={22} className="text-accent" /> : <FileJson size={22} className="text-accent" />}
          </div>
        )}
        <div>
          <p className="text-text-primary font-medium text-sm">
            {uploading ? "Uploading..." : isDragActive ? "Drop it here" : "Drop your API spec here"}
          </p>
          <p className="text-text-muted text-xs mt-1">
            Postman (.json) · OpenAPI (.yaml/.json) · PDF · DOCX · TXT
          </p>
        </div>
        {!uploading && (
          <button className="text-accent text-xs font-medium border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent/10 transition-colors">
            Browse files
          </button>
        )}
      </div>
    </div>
  );
}
