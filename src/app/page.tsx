import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Label } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const drops = await prisma.drop.findMany({
    orderBy: { startsAt: "asc" },
    take: 5,
  });
  const next = drops.find((d) => d.status === "SCHEDULED" || d.status === "LIVE") ?? drops[0];

  return (
    <main className="wrap">
      <Label letterSpacing={4}>Italian soul, Iranian taste</Label>
      <h1 style={{ marginTop: 12 }}>Where is MILO next?</h1>

      {next ? (
        <div className="card">
          <Label>Next residency</Label>
          <h2 style={{ fontSize: 30, marginTop: 8 }}>{next.name}</h2>
          <p className="muted">{next.location}</p>
          <p className="muted">{new Date(next.startsAt).toDateString()}</p>
          {next.storyLine && <p style={{ marginTop: 12, fontStyle: "italic" }}>{next.storyLine}</p>}
          <Link href={`/drops/${next.slug}`}>
            <button style={{ marginTop: 16 }}>Enter the drop</button>
          </Link>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 24 }}>No residency announced yet.</p>
      )}

      <div style={{ marginTop: 48, display: "flex", gap: 16 }}>
        <Link href="/passport">
          <button style={{ background: "var(--olive)" }}>Your Passport</button>
        </Link>
      </div>

      <p className="muted" style={{ marginTop: 40, fontSize: 13 }}>
        A passport is issued at your first collection.
      </p>
    </main>
  );
}
