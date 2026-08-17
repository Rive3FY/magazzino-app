import { Suspense } from "react";
import { AppLoading } from "../_components/AppSpinner";

export default function GiacenzeLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="panel" style={{ overflowX: "hidden" }}>
          <div className="pageBar">
            <div className="pageBarTitle">Magazzino - Inventario</div>
          </div>
          <div className="card" style={{ padding: 24 }}>
            <AppLoading />
          </div>
        </main>
      }
    >
      {children}
    </Suspense>
  );
}
