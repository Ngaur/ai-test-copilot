import { useQuery } from "@tanstack/react-query";
import { Code2, FileCode2, FlaskConical, Plus, Settings, Trash2 } from "lucide-react";
import { useState } from "react";
import { listSessions } from "@/api/sessions";
import SettingsModal from "@/components/Settings/SettingsModal";
import { useSessionStore } from "@/store/session";
import type { PastSession } from "@/types";

interface Props {
  onNewSession: () => void;
  onSelectPastSession: (session: PastSession) => void;
}

// ---------------------------------------------------------------------------
// Relative date helper
// ---------------------------------------------------------------------------

function relativeDate(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffDays = Math.floor(diffMs / 86_400_000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Single past-session row
// ---------------------------------------------------------------------------

function PastSessionRow({
  past,
  isViewing,
  onClick,
}: {
  past: PastSession;
  isViewing: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors group ${
        isViewing
          ? "bg-accent/10 ring-1 ring-accent/30"
          : "hover:bg-card"
      }`}
    >
      {/* Filename */}
      <span className="flex-1 truncate text-xs text-text-secondary group-hover:text-text-primary transition-colors leading-snug">
        {past.filename}
      </span>

      {/* Artifact badges */}
      <span className="flex items-center gap-1 flex-shrink-0">
        <Code2
          size={11}
          className={past.has_feature_files ? "text-green-400" : "text-text-muted opacity-30"}
          title={past.has_feature_files ? "Feature files available" : "No feature files"}
        />
        <FileCode2
          size={11}
          className={past.has_playwright ? "text-purple-400" : "text-text-muted opacity-30"}
          title={past.has_playwright ? "Playwright tests available" : "No Playwright tests"}
        />
      </span>

      {/* Relative date */}
      <span className="text-[10px] text-text-muted flex-shrink-0 hidden group-hover:block">
        {relativeDate(past.updated_at)}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export default function Sidebar({ onNewSession, onSelectPastSession }: Props) {
  const { session, viewingSession } = useSessionStore();
  const [showSettings, setShowSettings] = useState(false);

  const { data: pastSessions = [] } = useQuery({
    queryKey: ["past-sessions"],
    queryFn: listSessions,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Exclude the currently active session from the history list to avoid duplication
  const historyItems = pastSessions.filter(
    (p) => p.session_id !== session?.sessionId,
  );

  return (
    <aside className="w-[260px] flex-shrink-0 bg-sidebar flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2.5 px-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
            <FlaskConical size={16} className="text-white" />
          </div>
          <span className="font-semibold text-text-primary text-sm tracking-tight">
            AI Test Copilot
          </span>
        </div>
      </div>

      {/* New Session button */}
      <div className="px-3 pb-3">
        <button
          onClick={onNewSession}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-card hover:text-text-primary transition-colors group"
        >
          <Plus size={16} className="group-hover:text-accent transition-colors" />
          New Session
        </button>
      </div>

      <div className="mx-3 border-t border-border mb-3" />

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-3 scrollbar-thin">
        <p className="px-2 pb-1.5 text-[11px] font-medium text-text-muted uppercase tracking-wider">
          Recent
        </p>

        {/* Active in-memory session */}
        {session && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-card text-text-primary text-sm group cursor-pointer mb-1">
            <span className="flex-1 truncate text-xs">{session.filename}</span>
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-danger"
              onClick={onNewSession}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}

        {/* Past sessions from registry */}
        {historyItems.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {historyItems.map((past) => (
              <PastSessionRow
                key={past.session_id}
                past={past}
                isViewing={viewingSession?.session_id === past.session_id}
                onClick={() => onSelectPastSession(past)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!session && historyItems.length === 0 && (
          <p className="px-2 py-2 text-xs text-text-muted">No sessions yet</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 pb-4 border-t border-border pt-3">
        <button
          onClick={() => setShowSettings(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-card hover:text-text-primary transition-colors"
        >
          <Settings size={16} />
          Settings
        </button>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </aside>
  );
}
