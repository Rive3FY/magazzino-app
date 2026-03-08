import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
      const tablesHtml = movements.map((m: Record<string, unknown>, idx: number) => {
        const code = m.code ?? "-";
        const movement_id = m.movement_id ?? "-";
        const warehouse = m.warehouse ?? "-";
        const out_qty = m.out_qty ?? "-";
        const returned_qty = m.returned_qty ?? 0;
        const net_qty = m.net_qty ?? "-";
        const return_note = m.return_note ?? "-";
        const type = m.type ?? "-";
        return `
        <div style="margin-bottom: 24px;">
          <h3 style="margin-bottom: 8px; color: #1e40af;">Articolo ${idx + 1} · ${code}</h3>
          <table style="border-collapse: collapse; width: 100%; max-width: 720px;">
            <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>ID movimento</b></td><td style="padding: 6px; border: 1px solid #ddd;">${movement_id}</td></tr>
            <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Materiale</b></td><td style="padding: 6px; border: 1px solid #ddd;">${code}</td></tr>
            <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Tipo</b></td><td style="padding: 6px; border: 1px solid #ddd;">${type}</td></tr>
            <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Magazzino</b></td><td style="padding: 6px; border: 1px solid #ddd;">${warehouse}</td></tr>
            <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Quantità uscita</b></td><td style="padding: 6px; border: 1px solid #ddd;">${out_qty}</td></tr>
            <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Quantità rientrata</b></td><td style="padding: 6px; border: 1px solid #ddd;">${returned_qty}</td></tr>
            <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Quantità netta</b></td><td style="padding: 6px; border: 1px solid #ddd;">${net_qty}</td></tr>
            <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Nota rientro</b></td><td style="padding: 6px; border: 1px solid #ddd;">${return_note}</td></tr>
          </table>
        </div>`;
      }).join("");

      html = `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #111;">
        <h2 style="margin-bottom: 12px;">Rettifica / chiusura prelievo multiplo</h2>
        <p>È stata confermata la rettifica di un prelievo multiplo (${movements.length} articoli).</p>

        ${tablesHtml}

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

      subject = `Rettifica movimento materiale ${code ?? "-"}`;

      html = `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #111;">
        <h2 style="margin-bottom: 12px;">Rettifica / chiusura movimento</h2>
        <p>È stata confermata una rettifica di movimento materiale.</p>

        <table style="border-collapse: collapse; width: 100%; max-width: 720px;">
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>ID movimento</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${movement_id ?? "-"}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Materiale</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${code ?? "-"}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Tipo</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${type ?? "-"}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Magazzino</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${warehouse ?? "-"}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Quantità uscita</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${out_qty ?? "-"}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Quantità rientrata</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${returned_qty ?? 0}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Quantità netta</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${net_qty ?? "-"}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Nota rientro</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${return_note ?? "-"}</td>
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