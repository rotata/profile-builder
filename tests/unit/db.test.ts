import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/server/config";
import { closeDbForTests, getDb, messagesRepo } from "@/server/db";

beforeEach(() => {
  vi.stubEnv("DATABASE_PATH", ":memory:");
  resetConfigForTests();
  closeDbForTests();
});

afterEach(() => {
  closeDbForTests();
  vi.unstubAllEnvs();
  resetConfigForTests();
});

const msg = (id: string, role: "user" | "assistant", text: string) => ({
  id,
  role,
  text,
  status: "complete" as const,
  createdAt: new Date().toISOString(),
});

describe("messagesRepo", () => {
  it("round-trips messages in insertion order", () => {
    messagesRepo.insert(msg("a", "user", "hi"));
    messagesRepo.insert(msg("b", "assistant", "hello"));
    expect(messagesRepo.list().map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("skips a corrupted row instead of trusting it", () => {
    messagesRepo.insert(msg("a", "user", "hi"));
    getDb().exec(
      "INSERT INTO messages (id, role, text, status, created_at, seq) VALUES ('bad', 'system', 'x', 'complete', 'now', 99)",
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(messagesRepo.list().map((m) => m.id)).toEqual(["a"]);
    expect(warn).toHaveBeenCalledOnce();
  });
});
