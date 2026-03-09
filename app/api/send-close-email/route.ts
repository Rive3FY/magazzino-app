import { createClient } from "../../_lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM_EMAIL = process.env.FROM_EMAIL;

    if (!RESEND_API_KEY || !FROM_EMAIL) {
      return NextResponse.json(
        { error: "Configura RESEND_API_KEY e FROM_EMAIL in .env.local" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const movements = body?.movements;
    const isMulti = Array.isArray(movements) && movements.length > 0;

    const referent_email = body?.referent_email;
    const referent_name = body?.referent_name;
    const closed_by = body?.closed_by;
    const closed_at = body?.closed_at;

    if (!referent_email) {
      return NextResponse.json({ error: "referent_email richiesto" }, { status: 400 });
    }

    let subject: string;
    let html: string;

    if (isMulti) {
      subject = `Rettifica prelievo multiplo · ${movements.length} articoli`;
      const rowsHtml = movements.map((m: Record<string, unknown>, idx: number) => {
        const code = m.code ?? "-";
        const name = m.name ?? code;
        const warehouse = m.warehouse ?? "-";
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
      const firstMov = Array.isArray(movements) && movements.length > 0 ? (movements[0] as Record<string, unknown>) : null;
      const movement_id_val = body?.movement_id ?? firstMov?.movement_id ?? "-";
      const code_val = body?.code ?? firstMov?.code ?? "-";
      const name_val = body?.name ?? firstMov?.name ?? code_val;
      const warehouse_val = body?.warehouse ?? firstMov?.warehouse ?? "-";
      const out_qty_val = body?.out_qty ?? firstMov?.out_qty ?? "-";
      const returned_qty_val = body?.returned_qty ?? firstMov?.returned_qty ?? 0;
      const net_qty_val = body?.net_qty ?? firstMov?.net_qty ?? "-";
      const return_note_val = body?.return_note ?? firstMov?.return_note ?? "-";
      const type_val = body?.type ?? firstMov?.type ?? "-";

      subject = `Rettifica movimento materiale ${code_val}`;

      html = `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #111;">
        <h2 style="margin-bottom: 12px;">Rettifica / chiusura movimento</h2>
        <p>È stata confermata una rettifica di movimento materiale.</p>

        <table style="border-collapse: collapse; width: 100%; max-width: 720px;">
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>ID movimento</b></td><td style="padding: 6px; border: 1px solid #ddd;">${movement_id_val}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Codice</b></td><td style="padding: 6px; border: 1px solid #ddd;">${code_val}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Materiale</b></td><td style="padding: 6px; border: 1px solid #ddd;">${name_val}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Tipo</b></td><td style="padding: 6px; border: 1px solid #ddd;">${type_val}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Magazzino</b></td><td style="padding: 6px; border: 1px solid #ddd;">${warehouse_val}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Quantità uscita</b></td><td style="padding: 6px; border: 1px solid #ddd;">${out_qty_val}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Quantità rientrata</b></td><td style="padding: 6px; border: 1px solid #ddd;">${returned_qty_val}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Quantità netta</b></td><td style="padding: 6px; border: 1px solid #ddd;">${net_qty_val}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Nota rientro</b></td><td style="padding: 6px; border: 1px solid #ddd;">${return_note_val}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Referente</b></td><td style="padding: 6px; border: 1px solid #ddd;">${referent_name ?? "-"}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Chiuso da</b></td><td style="padding: 6px; border: 1px solid #ddd;">${closed_by ?? "-"}</td></tr>
          <tr><td style="padding: 6px; border: 1px solid #ddd;"><b>Data chiusura</b></td><td style="padding: 6px; border: 1px solid #ddd;">${closed_at ?? "-"}</td></tr>
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
      return NextResponse.json({ error: `Resend: ${errMsg}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, resend: resendData });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
