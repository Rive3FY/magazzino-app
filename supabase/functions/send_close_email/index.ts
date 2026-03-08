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

    const {
      movement_id,
      code,
      warehouse,
      out_qty,
      returned_qty,
      net_qty,
      return_note,
      referent_name,
      referent_email,
      closed_by,
      closed_at,
      type,
    } = body ?? {};

    if (!referent_email) {
      return new Response(
        JSON.stringify({ error: "Missing referent_email" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const subject = `Rettifica movimento materiale ${code ?? "-"}`;

    const html = `
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
            <td style="padding: 6px; border: 1px solid #ddd;">${referent_name ?? "-"}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Chiuso da</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${closed_by ?? "-"}</td>
          </tr>
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd;"><b>Data chiusura</b></td>
            <td style="padding: 6px; border: 1px solid #ddd;">${closed_at ?? "-"}</td>
          </tr>
        </table>

        <p style="margin-top: 16px; color: #555;">
          Email automatica generata dal gestionale magazzino.
        </p>
      </div>
    `;

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