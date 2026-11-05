export default function Home() {
  return (
    <main className="mx-auto flex h-full max-w-6xl gap-6 p-6 max-md:flex-col">
      <section className="flex min-h-0 flex-[3] flex-col rounded-xl border border-black/10 bg-white p-4">
        <h1 className="text-lg font-semibold">Profile Builder</h1>
        <p className="text-sm text-black/60">Chat coming in V0.2.</p>
      </section>
      <aside className="flex-[2] rounded-xl border border-black/10 bg-white p-4">
        <h2 className="font-semibold">Your travel profile</h2>
        <p className="text-sm text-black/60">Nothing learned yet.</p>
      </aside>
    </main>
  );
}
