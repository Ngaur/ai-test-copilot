import { CheckCircle2, Cpu } from "lucide-react";
import { useSessionStore } from "@/store/session";

export default function GenerationProgressBar() {
  const { session, generationProgress } = useSessionStore();

  if (session?.status !== "generating_automation" || !generationProgress) return null;

  const { current, total, currentTitle, phase } = generationProgress;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  const isPlaywright = phase === "playwright";
  const barColor = isPlaywright ? "bg-purple-500" : "bg-accent";
  const accentText = isPlaywright ? "text-purple-400" : "text-accent";
  const label = isPlaywright ? "Generating Playwright tests" : "Generating feature files";

  return (
    <div className="flex gap-3 py-3 px-4 animate-fade-in">
      {/* Avatar — matches MessageBubble assistant style */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center">
        <Cpu size={14} className="text-white" />
      </div>

      <div className="flex-1 max-w-[75%]">
        <span className="text-[11px] font-medium text-text-muted block mb-1.5">Test Copilot</span>

        <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 space-y-2.5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-primary">{label}</p>
            <span className={`text-xs font-semibold tabular-nums ${accentText}`}>
              {current} / {total}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Current module name */}
          {currentTitle && (
            <div className={`flex items-center gap-1.5 text-xs text-text-secondary`}>
              <CheckCircle2 size={12} className={`flex-shrink-0 ${accentText}`} />
              <span className="truncate">{currentTitle}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
