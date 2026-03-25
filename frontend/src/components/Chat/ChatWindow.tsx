import { ArrowUp, Paperclip } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { sendMessage } from "@/api/chat";
import { useSessionStore } from "@/store/session";
import GenerationProgressBar from "./GenerationProgressBar";
import MessageBubble from "./MessageBubble";

interface Props {
  onFileUploadClick: () => void;
}

export default function ChatWindow({ onFileUploadClick }: Props) {
  const { session, messages, addMessage, setLoading, isLoading } = useSessionStore();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSend = async () => {
    if (!input.trim() || !session?.threadId || isLoading) return;
    const text = input.trim();
    setInput("");
    addMessage({ role: "user", content: text });
    setLoading(true);
    try {
      const res = await sendMessage(session.threadId, session.sessionId, text);
      addMessage({ role: "assistant", content: res.message });
    } catch {
      addMessage({ role: "assistant", content: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const canSend = !!input.trim() && !!session?.threadId && !isLoading;

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 pb-16 animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
              <span className="text-2xl">🧪</span>
            </div>
            <div className="text-center">
              <p className="text-text-primary font-semibold text-lg">AI Test Copilot</p>
              <p className="text-text-secondary text-sm mt-1 max-w-sm">
                Upload a Postman collection or API spec to generate comprehensive test cases automatically.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[
                "Generate test cases from Postman",
                "Test my OpenAPI spec",
                "Create edge case tests",
                "Upload test data for automation",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="px-3 py-2.5 rounded-xl bg-card border border-border text-sm text-text-secondary hover:text-text-primary hover:border-accent/50 transition-all text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        <GenerationProgressBar />

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex gap-3 py-5 px-4 animate-fade-in">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center">
              <span className="text-white text-xs">🧪</span>
            </div>
            <div className="flex items-center gap-1 px-4 py-3 rounded-2xl rounded-tl-sm">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="w-2 h-2 bg-text-muted rounded-full animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-4 pb-4 pt-2">
        <div className="relative bg-card border border-border rounded-2xl focus-within:border-accent/60 transition-colors shadow-lg">
          <textarea
            ref={textareaRef}
            className="w-full bg-transparent text-text-primary placeholder-text-muted text-sm px-4 py-3.5 pr-24 resize-none focus:outline-none rounded-2xl leading-relaxed"
            placeholder={session?.threadId ? "Message Test Copilot..." : "Upload a file to get started"}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isLoading}
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            <button
              onClick={onFileUploadClick}
              className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-border transition-colors"
              title="Upload file"
            >
              <Paperclip size={16} />
            </button>
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={`p-2 rounded-xl transition-all ${
                canSend
                  ? "bg-accent text-white hover:bg-accent-hover shadow-md"
                  : "bg-border text-text-muted cursor-not-allowed"
              }`}
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
        <p className="text-center text-[11px] text-text-muted mt-2">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
