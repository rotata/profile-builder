"use client";

import { useState } from "react";
import { Chat } from "@/components/Chat";
import { toUIMessage } from "@/components/messages";
import { ProfilePanel } from "@/components/ProfilePanel";
import type { AppState, TurnEvent } from "@/shared/contract";

type WorkspaceProps = { initialState: AppState };

/** Client root: owns the profile state that the chat stream updates. */
export function Workspace({ initialState }: WorkspaceProps) {
  const [profile, setProfile] = useState(initialState.profile);
  const [updating, setUpdating] = useState(false);
  const [extractionFailed, setExtractionFailed] = useState(false);
  const [resetting, setResetting] = useState(false);

  function onTurnEvent(event: TurnEvent) {
    if (event.phase === "extracting") {
      setUpdating(true);
      return;
    }
    setUpdating(false);
    setProfile(event.result.profile);
    setExtractionFailed(event.result.extraction === "failed");
  }

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
        <Chat initialMessages={initialState.messages.map(toUIMessage)} onTurnEvent={onTurnEvent} />
      </section>
      <aside className="flex-[2] overflow-y-auto rounded-xl border border-black/10 bg-white p-4">
        <ProfilePanel profile={profile} updating={updating} extractionFailed={extractionFailed} />
      </aside>
    </main>
  );
}
