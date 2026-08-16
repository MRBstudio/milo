"use client";
import { useEffect, useState } from "react";
import { RequestError, errorMessage, fetchJson } from "@/lib/api-client";

export default function Operator() {
  const [pw, setPw] = useState("");
  const [ok, setOk] = useState(false);
  const [dropId, setDropId] = useState("");
  const [drops, setDrops] = useState<{ id: string; name: string; status: string; admission: string }[]>([]);
  const [data, setData] = useState<any>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  useEffect(() => {
    fetchJson<{ drops: typeof drops }>("/api/drops")
      .then((d) => setDrops(d.drops))
      .catch((err) => {
        console.error("Failed to load drops", err);
        setMsg({ text: `Could not load drops: ${errorMessage(err)}` });
      });
  }, []);

  /** Loads the live view; returns an error message on failure instead of throwing. */
  async function refresh(): Promise<string | null> {
    if (!dropId) return "Select a drop first";
    try {
      setData(await fetchJson(`/api/operator/live?dropId=${encodeURIComponent(dropId)}`, {
        headers: { "x-operator-password": pw },
      }));
      setOk(true);
      return null;
    } catch (err) {
      console.error("Operator live view failed", err);
      return err instanceof RequestError && err.status === 401 ? "Wrong password" : errorMessage(err);
    }
  }

  async function load() {
    const error = await refresh();
    setMsg(error ? { text: error } : null);
  }

  async function act(action: string) {
    setMsg(null);
    const forCode = action === "pay" || action === "collect" || action === "cancel";
    try {
      await fetchJson(`/api/operator/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-operator-password": pw },
        body: JSON.stringify(forCode ? { code } : { dropId }),
      });
      setMsg({ text: forCode ? `Done: ${code}` : "Done", ok: true });
      setCode("");
    } catch (err) {
      console.error(`Operator action ${action} failed`, err);
      setMsg({ text: `Error: ${errorMessage(err)}` });
    }
    // Refresh the live view either way: the action may have partially applied.
    const refreshError = await refresh();
    if (refreshError) setMsg({ text: `Live view stale: ${refreshError}` });
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
          {msg && <p style={{ marginTop: 8, color: "#c45c4a" }}>{msg.text}</p>}
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
                <div key={i.id} style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                  <span>{i.menuItem.name}</span>
                  <span className="muted">{i.available} left · {i.sold} sold</span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid #3a3a33", marginTop: 12, paddingTop: 12 }}>
                <strong>Order counts</strong>
                {data.statusCounts.map((s: any) => (
                  <div key={s.status} style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                    <span className="muted">{s.status}</span>
                    <span>{s._count._all}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
