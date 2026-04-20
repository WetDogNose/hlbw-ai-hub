import ScionDashboard from "@/components/scion-dashboard";

export const metadata = {
  title: "Scion Command Center | HLBW AI Hub",
  description: "Operator console for the Scion orchestration swarm",
};

export default function ScionPage() {
  return (
    <main className="container" style={{ padding: "var(--spacing-8) 0" }}>
      <ScionDashboard />
    </main>
  );
}
