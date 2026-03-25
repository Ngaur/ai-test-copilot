import { FlaskConical, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "@/types";

interface Props {
  message: ChatMessage;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 py-5 px-4 animate-fade-in ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold
          ${isUser ? "bg-card border border-border" : "bg-accent"}`}
      >
        {isUser ? <User size={15} className="text-text-secondary" /> : <FlaskConical size={15} />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <span className={`text-[11px] font-medium mb-0.5 ${isUser ? "text-right text-text-muted" : "text-text-muted"}`}>
          {isUser ? "You" : "Test Copilot"}
        </span>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed
            ${isUser
              ? "bg-card text-text-primary rounded-tr-sm"
              : "bg-transparent text-text-primary rounded-tl-sm"
            }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>,
                li: ({ children }) => <li className="text-text-primary">{children}</li>,
                code: ({ children, className }) => {
                  const isBlock = className?.includes("language-");
                  return isBlock ? (
                    <code className="block bg-[#1a1a1a] text-[#a5d6ff] px-3 py-2 rounded-lg text-xs font-mono my-2 overflow-x-auto">
                      {children}
                    </code>
                  ) : (
                    <code className="bg-[#1a1a1a] text-[#a5d6ff] px-1.5 py-0.5 rounded text-xs font-mono">
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => (
                  <pre className="bg-[#1a1a1a] rounded-xl p-3 overflow-x-auto text-xs my-2 font-mono">
                    {children}
                  </pre>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
}
