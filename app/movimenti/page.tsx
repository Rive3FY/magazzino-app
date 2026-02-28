"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../_lib/supabase/client";

type DbItem = {
  code: string;
  name: string;
  um: string | null;
  warehouse: string | null;
  warehouse_desc: string | null;
  initial_qty: number | null;
};

type DbMovement = {
  id: string;
  created_at: string;
  type: "IN" | "OUT";
  code: string;
  qty: number;
  note: string | null;
  created_by_email: string | null;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("it-IT");
}

function toNumber(v: string) {
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export default function MovimentiPage() {
  const supabase = createClient();

  const [type, setType] = useState<"IN" | "OUT">("IN");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const [picked, setPicked] = useState<DbItem | null>(null);
  const [suggestions, setSuggestions] = useState<DbItem[]>([]);
  const [stock, setStock] = useState<number | null>(null);

  const [history, setHistory] = useState<DbMovement[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
      setUserId(data.user?.id ?? null);
    });
    loadHistory();
  }, []);

  async function loadSuggestions(text: string) {
    if (!text.trim()) return setSuggestions([]);

    const { data } = await supabase
      .from("items")
      .select("code,name,um,warehouse,warehouse_desc,initial_qty")
      .or(`code.ilike.%${text}%,name.ilike.%${text}%`)
      .limit(12);

    setSuggestions((data ?? []) as DbItem[]);
  }

  async function computeStockFor(code: string) {
    const { data: item } = await supabase
      .from("items")
      .select("initial_qty")
      .eq("code", code)
      .single();

    const initial = Number(item?.initial_qty ?? 0);

    const { data: movs } = await supabase
      .from("movements")
      .select("type,qty")
      .eq("code", code);

    let delta = 0;
    for (const m of movs ?? []) {
      delta += m.type === "IN" ? Number(m.qty) : -Number(m.qty);
    }

    setStock(initial + delta);
  }

  async function loadHistory(code?: string) {
    let q = supabase
      .from("movements")
      .select("id,created_at,type,code,qty,note,created_by_email")
      .order("created_at", { ascending: false });

    if (code) q = q.eq("code", code);

    const { data } = await q;
    const rows = (data ?? []) as DbMovement[];
    setHistory(rows);

    const codes = Array.from(new Set(rows.map((r) => r.code)));
    if (codes.length === 0) return setNameMap({});

    const { data: itemsData } = await supabase
      .from("items")
      .select("code,name")
      .in("code", codes);

    const map: Record<string, string> = {};
    for (const it of itemsData ?? []) {
      map[it.code] = it.name ?? "";
    }
    setNameMap(map);
  }

  async function save() {
    if (!picked) return setMsg("Seleziona un materiale");
    const n = toNumber(qty);
    if (!Number.isFinite(n) || n <= 0) return setMsg("Quantità non valida");

    if (type === "OUT" && (stock ?? 0) - n < 0)
      return setMsg("Giacenza insufficiente");

    await supabase.from("movements").insert({
      type,
      code: picked.code,
      qty: n,
      note: note.trim() || null,
      created_by: userId,
      created_by_email: userEmail,
    });

    setQty("");
    setNote("");
    setMsg("Movimento salvato ✅");

    await computeStockFor(picked.code);
    await loadHistory(picked.code);
  }

  async function deleteMovement(id: string) {
    const ok = confirm("Sei sicuro di voler eliminare questo movimento?");
    if (!ok) return;

    await supabase.from("movements").delete().eq("id", id);

    if (picked) {
      await computeStockFor(picked.code);
      await loadHistory(picked.code);
    } else {
      await loadHistory();
    }
  }

  const active = useMemo(() => suggestions[activeIndex], [suggestions, activeIndex]);

  return (
    <main>
      <h1>Movimenti</h1>

      <div style={{ marginBottom: 20 }}>
        <input
          value={search}
          onChange={async (e) => {
            setSearch(e.target.value);
            await loadSuggestions(e.target.value);
            setOpen(true);
          }}
          placeholder="Cerca materiale..."
        />

        {open &&
          suggestions.map((it, i) => (
            <div
              key={it.code}
              onClick={() => {
                setPicked(it);
                setSearch(`${it.code} - ${it.name}`);
                setOpen(false);
                computeStockFor(it.code);
                loadHistory(it.code);
              }}
              style={{ cursor: "pointer", padding: 5 }}
            >
              {it.code} - {it.name}
            </div>
          ))}
      </div>

      {picked && (
        <div>
          Giacenza attuale: <b>{stock ?? 0}</b>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <button onClick={() => setType("IN")}>Entrata</button>
        <button onClick={() => setType("OUT")}>Uscita</button>
      </div>

      <div style={{ marginTop: 10 }}>
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="Quantità"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note"
        />
        <button onClick={save}>Salva</button>
      </div>

      {msg && <p>{msg}</p>}

      <h2 style={{ marginTop: 30 }}>Storico Movimenti</h2>

      <table border={1} cellPadding={5}>
        <thead>
          <tr>
            <th>Data</th>
            <th>Tipo</th>
            <th>Codice</th>
            <th>Nome</th>
            <th>Quantità</th>
            <th>Note</th>
            <th>Inserito da</th>
            <th>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {history.map((m) => (
            <tr key={m.id}>
              <td>{fmtDate(m.created_at)}</td>
              <td>{m.type}</td>
              <td>{m.code}</td>
              <td>{nameMap[m.code] ?? "-"}</td>
              <td>{m.qty}</td>
              <td>{m.note ?? ""}</td>
              <td>{m.created_by_email ?? "-"}</td>
              <td>
                <button onClick={() => deleteMovement(m.id)}>
                  Elimina
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}