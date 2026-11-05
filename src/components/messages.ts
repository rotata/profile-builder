import type { AppUIMessage, ChatMessage } from "@/shared/contract";

/** Persisted message → the shape useChat renders. */
export function toUIMessage(message: ChatMessage): AppUIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.text }],
  };
}

export function textOf(message: AppUIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}
