import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy · Gestionale Magazzino",
  description: "Informativa sulla privacy del Gestionale Magazzino",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-sm text-slate-500">
          <Link href="/login" className="text-sky-700 underline-offset-2 hover:underline">
            ← Torna al login
          </Link>
        </p>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          Informativa sulla privacy
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Ultimo aggiornamento: 17 luglio 2026
        </p>

        <div className="mt-8 space-y-6 text-[15px] leading-7 text-slate-800">
          <section>
            <h2 className="text-lg font-semibold">1. Titolare del trattamento</h2>
            <p className="mt-2">
              Il titolare del trattamento dei dati personali raccolti tramite
              l&apos;applicazione <strong>Gestionale Magazzino</strong> (sito web e
              app Android) è il soggetto gestore del servizio disponibile all&apos;indirizzo{" "}
              <a
                className="text-sky-700 underline-offset-2 hover:underline"
                href="https://www.gestionalemagazziniterna.it"
              >
                https://www.gestionalemagazziniterna.it
              </a>
              .
            </p>
            <p className="mt-2">
              Per richieste relative alla privacy puoi contattare il supporto
              tramite i canali indicati nella scheda dell&apos;app su Google Play
              oppure all&apos;indirizzo email fornito dal titolare del servizio.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. Quali dati trattiamo</h2>
            <p className="mt-2">A seconda dell&apos;uso del servizio, possiamo trattare:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                dati di account (email, password in forma criptata/hash, nome,
                cognome, matricola/badge);
              </li>
              <li>
                dati operativi di magazzino (movimenti, giacenze, attrezzature,
                referenti, log di attività);
              </li>
              <li>
                dati tecnici di accesso (indirizzo IP, log di autenticazione,
                tipo di dispositivo/browser, data e ora);
              </li>
              <li>
                dati raccolti da funzionalità del dispositivo, solo se
                autorizzate dall&apos;utente (es. fotocamera per lettura barcode/QR,
                NFC dove supportato).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Finalità del trattamento</h2>
            <p className="mt-2">I dati sono trattati per:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>creare e gestire l&apos;account utente;</li>
              <li>erogare le funzioni del gestionale di magazzino;</li>
              <li>garantire sicurezza, prevenzione abusi e tracciabilità operativa;</li>
              <li>inviare comunicazioni di servizio (es. email di notifica operative);</li>
              <li>adempiere a obblighi di legge, se applicabili.</li>
            </ul>
            <p className="mt-2">
              Non utilizziamo i dati per pubblicità personalizzata di terzi.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Base giuridica</h2>
            <p className="mt-2">
              Il trattamento avviene principalmente per l&apos;esecuzione del
              contratto/servizio richiesto dall&apos;utente (uso del gestionale), per
              legittimo interesse alla sicurezza del sistema e, ove richiesto, per
              adempiere a obblighi legali. Alcune funzioni del dispositivo (es.
              fotocamera) richiedono il consenso dell&apos;utente a livello di
              sistema operativo.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Modalità e luoghi di trattamento</h2>
            <p className="mt-2">
              I dati sono trattati con strumenti informatici e misure di sicurezza
              adeguate. Per autenticazione e database il servizio si avvale di
              fornitori tecnici (tra cui infrastruttura cloud e servizi di
              autenticazione/database, ad esempio Supabase e hosting del sito).
              I dati possono essere conservati su server situati nell&apos;Unione
              Europea o in Paesi terzi con garanzie appropriate secondo la
              normativa applicabile.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Conservazione</h2>
            <p className="mt-2">
              I dati dell&apos;account e i dati operativi sono conservati per tutto
              il periodo di utilizzo del servizio e successivamente per il tempo
              necessario a obblighi di legge, sicurezza o tutela di diritti. Alla
              richiesta di cancellazione account, i dati personali saranno
              eliminati o anonimizzati nei tempi tecnicamente e giuridicamente
              consentiti, salvo obblighi di conservazione.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Condivisione dei dati</h2>
            <p className="mt-2">
              I dati non sono venduti. Possono essere comunicati solo a:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>fornitori tecnici strettamente necessari al funzionamento del servizio;</li>
              <li>amministratori autorizzati dell&apos;organizzazione che usa il gestionale;</li>
              <li>autorità competenti, ove obbligatorio per legge.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Diritti dell&apos;interessato</h2>
            <p className="mt-2">
              Ai sensi del Regolamento (UE) 2016/679 (GDPR), puoi esercitare i
              diritti di accesso, rettifica, cancellazione, limitazione,
              opposizione e portabilità, nonché proporre reclamo all&apos;Autorità
              Garante per la protezione dei dati personali. Per esercitare i
              diritti contatta il titolare del servizio.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. App Android e permessi</h2>
            <p className="mt-2">
              L&apos;app Android apre il servizio web del gestionale. Può richiedere
              permessi del dispositivo (es. fotocamera) solo per funzioni
              specifiche come la scansione di codici. Puoi revocare i permessi
              dalle impostazioni del telefono.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Aggiornamenti</h2>
            <p className="mt-2">
              Questa informativa può essere aggiornata. La versione corrente è
              sempre disponibile a questa pagina.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
