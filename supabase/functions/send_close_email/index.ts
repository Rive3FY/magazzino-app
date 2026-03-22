import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function formatItRome(iso: unknown): string {
  if (typeof iso !== "string" || !iso.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders,
      });
    }

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing RESEND_API_KEY" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!FROM_EMAIL) {
      return new Response(
        JSON.stringify({ error: "Missing FROM_EMAIL" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.json();

    const movements = body?.movements;
    const isMulti = Array.isArray(movements) && movements.length > 0;

    const referent_email = body?.referent_email;
    const referent_name = body?.referent_name;
    const closed_by = body?.closed_by;
    const closed_at = body?.closed_at;

    if (!referent_email) {
      return new Response(
        JSON.stringify({ error: "Missing referent_email" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let subject: string;
    let html: string;

    if (isMulti) {
      subject = `Rettifica prelievo multiplo · ${movements.length} articoli`;
      const rowsHtml = movements.map((m: Record<string, unknown>, idx: number) => {
        const code = m.code ?? "-";
        const name = m.name ?? code;
        const warehouse = m.warehouse ?? "-";
        const opened = formatItRome(m.created_at) || "—";
        const out_qty = m.out_qty ?? "-";
        const returned_qty = m.returned_qty ?? 0;
        const net_qty = m.net_qty ?? "-";
        const return_note = m.return_note ?? "-";
        return `
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;">${idx + 1}</td>
            <td style="padding: 6px; border: 1px solid #ddd;">${code}</td>
            <td style="padding: 6px; border: 1px solid #ddd;">${name}</td>
            <td style="padding: 6px; border: 1px solid #ddd;">${warehouse}</td>
            <td style="padding: 6px; border: 1px solid #ddd;">${opened}</td>
            <td style="padding: 6px; border: 1px solid #ddd;">${out_qty}</td>
            <td style="padding: 6px; border: 1px solid #ddd;">${returned_qty}</td>
            <td style="padding: 6px; border: 1px solid #ddd;">${net_qty}</td>
            <td style="padding: 6px; border: 1px solid #ddd;">${return_note}</td>
          </tr>`;
      }).join("");

      html = `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #111;">
        <h2 style="margin-bottom: 12px;">Rettifica / chiusura prelievo multiplo</h2>
        <p>È stata confermata la rettifica di un prelievo multiplo (${movements.length} articoli).</p>

        <table style="border-collapse: collapse; width: 100%; max-width: 720px; margin-top: 16px;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="padding: 6px; border: 1px solid #ddd;"><b>#</b></th>
              <th style="padding: 6px; border: 1px solid #ddd;"><b>Codice</b></th>
              <th style="padding: 6px; border: 1px solid #ddd;"><b>Materiale</b></th>
              <th style="padding: 6px; border: 1px solid #ddd;"><b>Mag.</b></th>
              <th style="padding: 6px; border: 1px solid #ddd;"><b>Apertura prelievo</b></th>
              <th style="padding: 6px; border: 1px solid #ddd;"><b>Uscita</b></th>
              <th style="padding: 6px; border: 1px solid #ddd;"><b>Rientro</b></th>
              <th style="padding: 6px; border: 1px solid #ddd;"><b>Netto</b></th>
              <th style="padding: 6px; border: 1px solid #ddd;"><b>Nota</b></th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <table style="border-collapse: collapse; width: 100%; max-width: 720px; margin-top: 16px; background: #f8fafc;">
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Referente</b></td><td style="padding: 6px; border: 1px solid #ddd;">${referent_name ?? "-"}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Chiuso da</b></td><td style="padding: 6px; border: 1px solid #ddd;">${closed_by ?? "-"}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Data chiusura</b></td><td style="padding: 6px; border: 1px solid #ddd;">${closed_at ?? "-"}</td></tr>
        </table>

        <p style="margin-top: 16px; color: #555;">
          Email automatica generata dal gestionale magazzino.
        </p>
      </div>
    `;
    } else {
      // Fallback: se abbiamo movements[0] ma siamo nel branch singolo, usalo per i dati mancanti
      const firstMov = Array.isArray(movements) && movements.length > 0 ? (movements[0] as Record<string, unknown>) : null;
      const {
        movement_id,
        code,
        warehouse,
        out_qty,
        returned_qty,
        net_qty,
        return_note,
        referent_name: rn,
        closed_by: cb,
        closed_at: ca,
        type,
      } = body ?? {};
      const movement_id_val = movement_id ?? firstMov?.movement_id ?? "-";
      const code_val = code ?? firstMov?.code ?? "-";
      const name_val = (body as any)?.name ?? firstMov?.name ?? code_val;
      const warehouse_val = warehouse ?? firstMov?.warehouse ?? "-";
      const created_at_body = (body as Record<string, unknown>)?.created_at;
      const opened_label = formatItRome(created_at_body ?? firstMov?.created_at);
      const reference_val = opened_label
        ? `${code_val} · mag. ${warehouse_val} · apertura ${opened_label}`
        : `${code_val} · mag. ${warehouse_val}`;
      const out_qty_val = out_qty ?? firstMov?.out_qty ?? "-";
      const returned_qty_val = returned_qty ?? firstMov?.returned_qty ?? 0;
      const net_qty_val = net_qty ?? firstMov?.net_qty ?? "-";
      const return_note_val = return_note ?? firstMov?.return_note ?? "-";
      const type_val = type ?? firstMov?.type ?? "-";

      subject = `Rettifica movimento materiale ${code_val}`;

      html = `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #111;">
        <h2 style="margin-bottom: 12px;">Rettifica / chiusura movimento</h2>
        <p>È stata confermata una rettifica di movimento materiale.</p>

        <table style="border-collapse: collapse; width: 100%; max-width: 720px;">
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Riferimento</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${reference_val}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>ID interno (supporto)</b></td>
            <td style="padding: 6px; border: 1px solid #ddd; font-size: 12px; color: #64748b;">${movement_id_val}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Codice</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${code_val}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Materiale</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${name_val}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Tipo</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${type_val}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Magazzino</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${warehouse_val}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Quantità uscita</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${out_qty_val}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Quantità rientrata</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${returned_qty_val}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Quantità netta</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${net_qty_val}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Nota rientro</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${return_note_val}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Referente</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${rn ?? "-"}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Chiuso da</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${cb ?? "-"}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Data chiusura</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${ca ?? "-"}</td>
          </tr>
        </table>

        <p style="margin-top: 16px; color: #555;">
          Email automatica generata dal gestionale magazzino.
        </p>
      </div>
    `;
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [referent_email],
        subject,
        html,
      }),
    });

    const resendData = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      const errMsg = resendData?.message ?? resendData?.error ?? JSON.stringify(resendData);
      return new Response(
        JSON.stringify({
          error: `Resend API: ${errMsg}`,
          details: resendData,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, resend: resendData }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});