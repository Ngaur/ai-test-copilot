import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { getPlaywrightTest } from "@/api/chat";
import { useSessionStore } from "@/store/session";

export default function PlaywrightTestViewer() {
  const { session } = useSessionStore();
  const threadId = session?.threadId;

  const { data, isLoading } = useQuery({
    queryKey: ["playwright-test", threadId],
    queryFn: () => getPlaywrightTest(threadId!),
    enabled: !!threadId,
  });

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

  if (!data?.content) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted">
        <FlaskConical size={32} className="opacity-30" />
        <p className="text-sm">Playwright test file will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 flex-shrink-0">
        <FlaskConical size={14} className="text-purple-400" />
        <span className="text-xs font-mono text-text-muted truncate">
          {data.file_path.split("/").pop()}
        </span>
      </div>
      <pre className="flex-1 overflow-auto scrollbar-thin text-[12px] font-mono leading-relaxed text-text-primary bg-surface p-4 m-0">
        {data.content}
      </pre>
    </div>
  );
}
