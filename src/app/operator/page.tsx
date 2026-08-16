"use client";
import { useEffect, useState } from "react";
import { Msg, requestJson } from "@/lib/api-client";
import { ErrorText, Row } from "@/components/ui";

export default function Operator() {
  const [pw, setPw] = useState("");
  const [ok, setOk] = useState(false);
  const [dropId, setDropId] = useState("");
  const [drops, setDrops] = useState<{ id: string; name: string; status: string; admission: string }[]>([]);
  const [data, setData] = useState<any>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<Msg | null>(null);

  useEffect(() => {
    requestJson<{ drops: typeof drops }>("/api/drops").then(({ data }) => setDrops(data.drops));
  }, []);

  async function load() {
    setMsg(null);
    const { ok: authed, data } = await requestJson(`/api/operator/live?dropId=${dropId}`, {
      headers: { "x-operator-password": pw },
    });
    if (authed) {
      setData(data);
      setOk(true);
    } else {
      setMsg({ text: "Wrong password" });
    }
  }

  async function act(action: string) {
    setMsg(null);
    const isOrderAction = action === "pay" || action === "collect" || action === "cancel";
    const { ok: done, data: d } = await requestJson(`/api/operator/${action}`, {
      method: "POST",
      headers: { "x-operator-password": pw },
      body: isOrderAction ? { code } : { dropId },
    });
    if (done) {
      setMsg({ text: `Done: ${code}`, ok: true });
      setCode("");
      load(); // refresh live view
    } else {
      setMsg({ text: `Error: ${d.error}` });
    }
  }

  return (
    <main className="wrap">
      <h1>Operator</h1>
      {!ok ? (
        <div className="card">
          <input type="password" placeholder="Operator password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <select value={dropId} onChange={(e) => setDropId(e.target.value)} style={{ marginTop: 8 }}>
            <option value="">Select drop</option>
            {drops.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.status} / {d.admission})
              </option>
            ))}
          </select>
          <button onClick={load} style={{ marginTop: 8 }}>Enter</button>
          {msg && <ErrorText style={{ marginTop: 8 }}>{msg.text}</ErrorText>}
        </div>
      ) : (
        <>
          <div className="card">
            <strong>Take payment + collect</strong>
            <input placeholder="Pickup code e.g. MILO-4F2A" value={code} onChange={(e) => setCode(e.target.value)} style={{ marginTop: 8 }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => act("pay")}>Mark PAID</button>
              <button onClick={() => act("collect")}>Collect</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => act("cancel")}>Cancel Reservation</button>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <strong>Admission control</strong>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => act("safe-mode")}>Safe mode (pause)</button>
              <button onClick={() => act("reopen")}>Reopen</button>
            </div>
          </div>

          {msg && (
            <p style={{ marginTop: 12, color: msg.ok ? "var(--olive)" : "#c45c4a" }}>{msg.text}</p>
          )}

          {data && (
            <div className="card" style={{ marginTop: 16 }}>
              <strong>Live inventory</strong>
              {data.items.map((i: any) => (
                <Row
                  key={i.id}
                  left={<span>{i.menuItem.name}</span>}
                  right={<span className="muted">{i.available} left · {i.sold} sold</span>}
                />
              ))}
              <div style={{ borderTop: "1px solid #3a3a33", marginTop: 12, paddingTop: 12 }}>
                <strong>Order counts</strong>
                {data.statusCounts.map((s: any) => (
                  <Row
                    key={s.status}
                    style={{ marginTop: 6 }}
                    left={<span className="muted">{s.status}</span>}
                    right={<span>{s._count._all}</span>}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
