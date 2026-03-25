import { FlaskConical, Plus, Settings, Trash2 } from "lucide-react";
import { useState } from "react";
import SettingsModal from "@/components/Settings/SettingsModal";
import { useSessionStore } from "@/store/session";

interface Props {
  onNewSession: () => void;
}

export default function Sidebar({ onNewSession }: Props) {
  const { session } = useSessionStore();
  const [showSettings, setShowSettings] = useState(false);

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
        {session ? (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-card text-text-primary text-sm group cursor-pointer">
            <span className="flex-1 truncate">{session.filename}</span>
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-danger"
              onClick={onNewSession}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ) : (
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
