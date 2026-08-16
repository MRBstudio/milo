"use client";
import { useState } from "react";
import { requestJson } from "@/lib/api-client";
import { BackLink, Label, PhoneInput, Row } from "@/components/ui";
import { PHONE_LENGTH } from "@/lib/validation";

export default function PassportPage() {
  const [phone, setPhone] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function look() {
    setLoading(true);
    const { data } = await requestJson(`/api/passport?phone=${encodeURIComponent(phone)}`);
    setData(data);
    setLoading(false);
  }

  return (
    <main className="wrap">
      <h1>MILO Passport</h1>
      <div className="card">
        <PhoneInput value={phone} onChange={setPhone} label="Your phone" />
        <button onClick={look} disabled={loading || phone.length < PHONE_LENGTH} style={{ marginTop: 8 }}>
          {loading ? "…" : "Open passport"}
        </button>
      </div>
      {data && !data.exists && (
        <p className="muted" style={{ marginTop: 16 }}>
          Your passport begins at your first collection. Order a sandwich, pay, and collect at the event to get your first stamp.
        </p>
      )}
      {data?.exists && (
        <div className="card" style={{ marginTop: 16 }}>
          <Label>Traveler No.</Label>
          <h2>{data.travelerNumber}</h2>
          {data.foundingTraveler && <p style={{ color: "#8b4a2f", fontWeight: 500 }}>Founding Traveler</p>}
          <Label letterSpacing={2} style={{ marginTop: 16 }}>Stamps</Label>
          {data.stamps.length === 0 && <p className="muted" style={{ marginTop: 8 }}>No stamps yet.</p>}
          {data.stamps.map((s: any, i: number) => (
            <Row key={i} left={<span>{s.dropName}</span>} right={<span className="muted">{s.location}</span>} />
          ))}
        </div>
      )}
      <BackLink />
    </main>
  );
}
