import HubLauncher from "./_components/HubLauncher";

export default function Home() {
  return (
    <main className="panel launcherPanel">
      <div className="pageBar">
        <div className="pageBarTitle">Selezione modulo</div>
      </div>

      <HubLauncher />
    </main>
  );
}
