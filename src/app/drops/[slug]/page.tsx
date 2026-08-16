"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Msg, requestJson } from "@/lib/api-client";
import { BackLink, ErrorText, Label, PhoneInput, Row } from "@/components/ui";
import { PHONE_ERROR_FA, isValidPhone } from "@/lib/validation";

type Item = { id: string; capacity: number; available: number; reserved: number; sold: number; menuItem: { name: string; price: number; description: string } };
type Drop = { id: string; name: string; location: string; admission: string; status: string; items: Item[] };

export default function DropPage() {
  const { slug } = useParams<{ slug: string }>();
  const [drop, setDrop] = useState<Drop | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<Msg | null>(null);

  useEffect(() => {
    requestJson<{ drop: Drop }>(`/api/drops/${slug}`).then(({ data }) => setDrop(data.drop));
  }, [slug]);

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
    if (!isValidPhone(phone)) {
      setMsg({ text: PHONE_ERROR_FA });
      return;
    }

    const lines = Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([dropItemId, qty]) => ({ dropItemId, qty }));
    const { ok, data } = await requestJson("/api/reservations", {
      method: "POST",
      body: { dropId: drop!.id, name, phone, lines },
    });
    if (ok) {
      setMsg({ text: data.code, ok: true });
    } else {
      setMsg({ text: data.error === "SOLD_OUT" ? "Sold out." : data.error === "ALREADY_RESERVED" ? "You already have a reservation for this drop." : data.error });
    }
  }

  // --- Payment confirmed view ---
  if (msg?.ok) {
    return (
      <main className="wrap">
        <h1>Reservation Confirmed</h1>
        <div className="card-green" style={{ marginTop: 24, textAlign: "center" }}>
          <Label>Your Reservation ID</Label>
          <p className="mono" style={{ fontSize: 28, marginTop: 12 }}>{msg.text}</p>
        </div>

        <div className="card" style={{ marginTop: 24 }}>
          <Label letterSpacing={2}>Amount to Transfer</Label>
          <p style={{ fontSize: 24, marginTop: 8 }}>{total.toLocaleString()} <span className="muted" style={{ fontSize: 16 }}>تومان</span></p>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <Label letterSpacing={2}>Card Number</Label>
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
          <Label letterSpacing={1} style={{ fontSize: 13 }}>Your order</Label>
          {drop.items.filter(i => cart[i.id] > 0).map((item) => (
            <Row
              key={item.id}
              left={<span>{item.menuItem.name} ×{cart[item.id]}</span>}
              right={<span className="muted">{(item.menuItem.price * cart[item.id]!).toLocaleString()} T</span>}
            />
          ))}
          <Row
            style={{ borderTop: "1px solid #3a3a33", marginTop: 12, paddingTop: 12 }}
            left={<strong>Total</strong>}
            right={<strong>{total.toLocaleString()} Toman</strong>}
          />
        </div>
      )}

      <div className="card">
        <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <PhoneInput value={phone} onChange={setPhone} style={{ marginTop: 8 }} />
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          Reserve now → pay by card transfer → collect at the event.
        </p>
        <button
          onClick={reserve}
          disabled={!name || !phone || total === 0 || drop.admission !== "OPEN"}
          style={{ marginTop: 12, width: "100%" }}
        >
          Reserve
        </button>
        {msg && !msg.ok && <ErrorText>{msg.text}</ErrorText>}
      </div>

      <BackLink />
    </main>
  );
}
