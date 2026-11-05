"use client";

import { useState } from "react";
import { Chat } from "@/components/Chat";
import { toUIMessage } from "@/components/messages";
import type { AppState } from "@/shared/contract";

type WorkspaceProps = { initialState: AppState };

/** Client root: owns the profile/conflict state that the chat stream updates. */
export function Workspace({ initialState }: WorkspaceProps) {
  const [resetting, setResetting] = useState(false);

  async function startOver() {
    setResetting(true);
    await fetch("/api/reset", { method: "POST" });
    window.location.reload(); // simplest way to reset useChat's internal state
  }

  return (
    <main className="mx-auto flex h-full max-w-6xl gap-6 p-6 max-md:flex-col">
      <section className="flex min-h-0 flex-[3] flex-col rounded-xl border border-black/10 bg-white p-4">
        <header className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Profile Builder</h1>
          <button
            type="button"
            onClick={startOver}
            disabled={resetting}
            className="text-sm text-black/50 hover:text-black disabled:opacity-40"
          >
            Start over
          </button>
        </header>
        <Chat initialMessages={initialState.messages.map(toUIMessage)} />
      </section>
      <aside className="flex-[2] rounded-xl border border-black/10 bg-white p-4">
        <h2 className="font-semibold">Your travel profile</h2>
        <p className="text-sm text-black/60">Nothing learned yet.</p>
      </aside>
    </main>
  );
}
