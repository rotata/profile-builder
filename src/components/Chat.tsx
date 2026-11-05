"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { ErrorBanner } from "@/components/ErrorBanner";
import { type AppUIMessage, type ChatRequest, parseApiError } from "@/shared/contract";

type ChatProps = {
  initialMessages: AppUIMessage[];
};

function textOf(message: AppUIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

// History is server-owned: send only the newest user message.
const transport = new DefaultChatTransport<AppUIMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ messages }) => {
    const last = messages[messages.length - 1];
    const body: ChatRequest = { message: last ? textOf(last) : "" };
    return { body };
  },
});

export function Chat({ initialMessages }: ChatProps) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error, clearError, setMessages } = useChat<AppUIMessage>({
    transport,
    messages: initialMessages,
  });
  const busy = status === "submitted" || status === "streaming";
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    clearError();
    setInput("");
    void sendMessage({ text });
  }

  /** The failed turn was not saved server-side; drop it locally and restore the draft. */
  function retry() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const cutoff = lastUser ? messages.indexOf(lastUser) : messages.length;
    setMessages(messages.slice(0, cutoff));
    clearError();
    if (lastUser) setInput(textOf(lastUser));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-4" aria-live="polite">
        {messages.length === 0 && (
          <p className="text-sm text-black/50">
            Tell me about how you like to travel — where you&apos;ve loved going, what you eat, who you travel with.
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            data-testid={`message-${message.role}`}
            className={
              message.role === "user"
                ? "ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-black px-4 py-2 text-white"
                : "mr-auto max-w-[80%] rounded-2xl rounded-bl-sm bg-black/[.04] px-4 py-2"
            }
          >
            <p className="whitespace-pre-wrap">{textOf(message)}</p>
          </div>
        ))}
        {status === "submitted" && (
          <div className="mr-auto text-sm text-black/40" data-testid="thinking">
            Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <ErrorBanner error={parseApiError(error)} onRetry={retry} />}

      <form
        className="flex gap-2 border-t border-black/10 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          aria-label="Message"
          className="min-h-11 flex-1 resize-none rounded-lg border border-black/15 px-3 py-2 outline-none focus:border-black/40"
          rows={1}
          value={input}
          placeholder="e.g. I'm vegetarian and I love slow trips with lots of food"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-black px-4 text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
