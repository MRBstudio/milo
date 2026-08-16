"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { errorMessage, fetchJson } from "@/lib/api-client";

type Item = { id: string; capacity: number; available: number; reserved: number; sold: number; menuItem: { name: string; price: number; description: string } };
type Drop = { id: string; name: string; location: string; admission: string; status: string; items: Item[] };

export default function DropPage() {
  const { slug } = useParams<{ slug: string }>();
  const [drop, setDrop] = useState<Drop | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ drop: Drop }>(`/api/drops/${slug}`)
      .then((d) => {
        if (!cancelled) setDrop(d.drop);
      })
      .catch((err) => {
        console.error(`Failed to load drop ${slug}`, err);
        if (!cancelled) setLoadError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loadError) {
    return (
      <main className="wrap">
        <p style={{ color: "#c45c4a" }}>{loadError}</p>
        <Link href="/"><p className="muted" style={{ marginTop: 24, fontSize: 13 }}>← Back to MILO</p></Link>
      </main>
    );
  }

  if (!drop) return <main className="wrap"><p className="muted">Loading…</p></main>;

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const remove = (id: string) => setCart((c) => {
    const next = { ...c };
    if (next[id] > 1) next[id]--;
    else delete next[id];
    return next;
  });
  const total = drop.items.reduce((s, i) => s + (cart[i.id] ?? 0) * i.menuItem.price, 0);
  const totalQty = Object.values(cart).reduce((s, q) => s + q, 0);

  async function reserve() {
    setMsg(null);
    // Validate phone format client-side
    if (!/^09\d{9}$/.test(phone)) {
      setMsg({ text: "شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود" });
      return;
    }

    const lines = Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([dropItemId, qty]) => ({ dropItemId, qty }));

    setSubmitting(true);
    try {
      const data = await fetchJson<{ code: string }>("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dropId: drop!.id, name, phone, lines }),
      });
      setMsg({ text: data.code, ok: true });
    } catch (err) {
      console.error("Reservation failed", err);
      setMsg({ text: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  // --- Payment confirmed view ---
  if (msg?.ok) {
    return (
      <main className="wrap">
        <h1>Reservation Confirmed</h1>
        <div className="card-green" style={{ marginTop: 24, textAlign: "center" }}>
          <p className="muted" style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase" }}>Your Reservation ID</p>
          <p className="mono" style={{ fontSize: 28, marginTop: 12 }}>{msg.text}</p>
        </div>

        <div className="card" style={{ marginTop: 24 }}>
          <p className="muted" style={{ letterSpacing: 2, textTransform: "uppercase", fontSize: 12 }}>Amount to Transfer</p>
          <p style={{ fontSize: 24, marginTop: 8 }}>{total.toLocaleString()} <span className="muted" style={{ fontSize: 16 }}>تومان</span></p>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted" style={{ letterSpacing: 2, textTransform: "uppercase", fontSize: 12 }}>Card Number</p>
          <p className="mono" style={{ fontSize: 20, marginTop: 8, letterSpacing: 3 }}>XXXX XXXX XXXX XXXX</p>
          <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>Cardholder: MILO</p>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <p style={{ fontWeight: 500, marginBottom: 8 }}>After payment:</p>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
            1. Take a screenshot of the transfer receipt<br />
            2. Send it to us via WhatsApp or Telegram<br />
            3. Include your reservation ID: <span className="mono terracotta">{msg.text}</span><br />
            4. Your order will be confirmed
          </p>
        </div>

        <p className="muted" style={{ marginTop: 24, fontSize: 13 }}>
          Show this code at the event to collect your order. Your passport stamp will be issued on collection.
        </p>

        <Link href="/">
          <button style={{ marginTop: 24, background: "var(--olive)" }}>Back to MILO</button>
        </Link>
      </main>
    );
  }

  // --- Menu + reserve view ---
  return (
    <main className="wrap">
      <h1>{drop.name}</h1>
      <p className="muted">{drop.location}</p>
      {drop.admission !== "OPEN" && (
        <p className="terracotta" style={{ marginTop: 12, fontWeight: 500 }}>
          {drop.admission === "PAUSED" ? "Reservations temporarily paused." : "Admission closed."}
        </p>
      )}

      {drop.items.map((item) => {
        const inCart = cart[item.id] ?? 0;
        return (
          <div className="card" key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{item.menuItem.name}</strong>
              <p className="muted" style={{ fontSize: 14 }}>{item.menuItem.description}</p>
              <p className="muted" style={{ fontSize: 13 }}>{item.available} of {item.capacity} left</p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
              <p>{item.menuItem.price.toLocaleString()} T</p>
              <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                {inCart > 0 && <button onClick={() => remove(item.id)} style={{ padding: "6px 12px" }}>−</button>}
                {inCart > 0 && <span style={{ minWidth: 20, textAlign: "center" }}>{inCart}</span>}
                <button onClick={() => add(item.id)} disabled={item.available === 0} style={{ padding: "6px 12px" }}>+</button>
              </div>
            </div>
          </div>
        );
      })}

      {totalQty > 0 && (
        <div className="card">
          <p style={{ fontSize: 13, letterSpacing: 1, textTransform: "uppercase" }} className="muted">Your order</p>
          {drop.items.filter(i => cart[i.id] > 0).map((item) => (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span>{item.menuItem.name} ×{cart[item.id]}</span>
              <span className="muted">{(item.menuItem.price * cart[item.id]!).toLocaleString()} T</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #3a3a33", marginTop: 12, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
            <strong>Total</strong>
            <strong>{total.toLocaleString()} Toman</strong>
          </div>
        </div>
      )}

      <div className="card">
        <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          placeholder="Phone (09xxxxxxxxx)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ marginTop: 8 }}
          maxLength={11}
        />
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          Reserve now → pay by card transfer → collect at the event.
        </p>
        <button
          onClick={reserve}
          disabled={submitting || !name || !phone || total === 0 || drop.admission !== "OPEN"}
          style={{ marginTop: 12, width: "100%" }}
        >
          {submitting ? "Reserving…" : "Reserve"}
        </button>
        {msg && !msg.ok && <p style={{ marginTop: 12, color: "#c45c4a" }}>{msg.text}</p>}
      </div>

      <Link href="/">
        <p className="muted" style={{ marginTop: 32, fontSize: 13 }}>← Back to MILO</p>
      </Link>
    </main>
  );
}
