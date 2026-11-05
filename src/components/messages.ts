import type { AppUIMessage, ChatMessage, DestinationLookup } from "@/shared/contract";

/** Persisted message → the shape useChat renders (same parts a live stream produces). */
export function toUIMessage(message: ChatMessage): AppUIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [
      ...message.lookups.map((lookup, i) => ({ type: "data-lookup" as const, id: `lookup-${i + 1}`, data: lookup })),
      { type: "text" as const, text: message.text },
    ],
  };
}

export function textOf(message: AppUIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

export function lookupsOf(message: AppUIMessage): DestinationLookup[] {
  return message.parts.flatMap((part) => (part.type === "data-lookup" ? [part.data] : []));
}
