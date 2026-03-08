import { Suspense } from "react";

export default function GiacenzeLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="panel" style={{ overflowX: "hidden" }}>
          <div className="pageBar">
            <div className="pageBarTitle">Magazzino - Giacenze</div>
          </div>
          <div className="card" style={{ padding: 24 }}>
            Caricamento…
          </div>
        </main>
      }
    >
      {children}
    </Suspense>
  );
}
