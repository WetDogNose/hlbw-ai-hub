import ScionDashboard from '@/components/scion-dashboard';

export const metadata = {
  title: 'Scion Command Center | HLBW AI Hub',
  description: 'Manage Scion orchestration and agents',
};

export default function ScionAdminPage() {
  return (
    <main className="container" style={{ padding: 'var(--spacing-8) 0' }}>
      <ScionDashboard />
    </main>
  );
}
