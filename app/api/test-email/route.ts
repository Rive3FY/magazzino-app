import { NextResponse } from "next/server";

/**
 * Route di test per verificare la configurazione Resend.
 * Chiama: GET /api/test-email?to=TUA_EMAIL
 * Esempio: http://localhost:3000/api/test-email?to=tuo@email.com
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const to = searchParams.get("to");

    if (!to || !to.includes("@")) {
      return NextResponse.json(
        { error: "Aggiungi ?to=tuo@email.com all'URL" },
        { status: 400 }
      );
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM_EMAIL = process.env.FROM_EMAIL;

    if (!RESEND_API_KEY) {
      return NextResponse.json(
        { error: "RESEND_API_KEY mancante in .env.local" },
        { status: 500 }
      );
    }

    if (!FROM_EMAIL) {
      return NextResponse.json(
        { error: "FROM_EMAIL mancante in .env.local" },
        { status: 500 }
      );
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: "Test email magazzino",
        html: `
          <p>Se ricevi questa email, Resend è configurato correttamente.</p>
          <p>FROM: ${FROM_EMAIL}</p>
          <p>Data: ${new Date().toISOString()}</p>
        `,
      }),
    });

    const data = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      return NextResponse.json(
        {
          error: "Resend ha rifiutato l'invio",
          detail: data?.message ?? data?.name ?? JSON.stringify(data),
          hint:
            data?.message?.includes("domain") || data?.message?.includes("verified")
              ? "Con onboarding@resend.dev puoi inviare SOLO all'email del tuo account Resend. Per altri destinatari, verifica un dominio su resend.com/domains"
              : undefined,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Email inviata. Controlla la casella (e lo spam) di " + to,
      id: data?.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
