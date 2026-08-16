"use client";
import { useState } from "react";
import Link from "next/link";
import { errorMessage, fetchJson } from "@/lib/api-client";

export default function PassportPage() {
  const [phone, setPhone] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function look() {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchJson(`/api/passport?phone=${encodeURIComponent(phone)}`));
    } catch (err) {
      console.error("Passport lookup failed", err);
      setData(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap">
      <h1>MILO Passport</h1>
      <div className="card">
        <input placeholder="Your phone (09xxxxxxxxx)" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={11} />
        <button onClick={look} disabled={loading || phone.length < 11} style={{ marginTop: 8 }}>
          {loading ? "…" : "Open passport"}
        </button>
        {error && <p style={{ marginTop: 12, color: "#c45c4a" }}>{error}</p>}
      </div>
      {data && !data.exists && (
        <p className="muted" style={{ marginTop: 16 }}>
          Your passport begins at your first collection. Order a sandwich, pay, and collect at the event to get your first stamp.
        </p>
      )}
      {data?.exists && (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted" style={{ letterSpacing: 3, fontSize: 12, textTransform: "uppercase" }}>Traveler No.</p>
          <h2>{data.travelerNumber}</h2>
          {data.foundingTraveler && <p style={{ color: "#8b4a2f", fontWeight: 500 }}>Founding Traveler</p>}
          <p className="muted" style={{ marginTop: 16, letterSpacing: 2, textTransform: "uppercase", fontSize: 12 }}>Stamps</p>
          {data.stamps.length === 0 && <p className="muted" style={{ marginTop: 8 }}>No stamps yet.</p>}
          {data.stamps.map((s: any, i: number) => (
            <div key={i} style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
              <span>{s.dropName}</span>
              <span className="muted">{s.location}</span>
            </div>
          ))}
        </div>
      )}
      <Link href="/">
        <p className="muted" style={{ marginTop: 32, fontSize: 13 }}>← Back to MILO</p>
      </Link>
    </main>
  );
}
