import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/axios.js';
import { PageHeader, StatTile, Card, Spinner, ErrorNote, Badge, num, inr, fmtDate } from '../components/ui.jsx';
import { apiMessage } from '../api/axios.js';

function TierBars({ distribution }) {
  const total = distribution.reduce((s, d) => s + d.count, 0);
  if (!total) {
    return <p className="py-6 text-center text-sm text-gray-400">No members enrolled in tiers yet.</p>;
  }
  return (
    <div className="space-y-3">
      {distribution.map((d) => {
        const pct = Math.round((d.count / total) * 100);
        return (
          <div key={d.tierId || 'none'}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium text-gray-700">{d.tierName || 'No tier'}</span>
              <span className="text-gray-500">{num(d.count)} · {pct}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-viz-blue" style={{ width: `${Math.max(pct, 2)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const dash = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/analytics/dashboard').then((r) => r.data.data),
  });
  const recent = useQuery({
    queryKey: ['orders', 'recent'],
    queryFn: () => api.get('/orders?limit=6').then((r) => r.data.data),
  });

  if (dash.isPending) return <Spinner />;
  if (dash.isError) return <ErrorNote>{apiMessage(dash.error)}</ErrorNote>;

  const d = dash.data;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Your loyalty program at a glance — last 30 days." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Total members" value={num(d.totalMembers)} />
        <StatTile label="Active members" value={num(d.activeMembers)} />
        <StatTile label="Points liability" value={num(d.pointsLiability)} sub="outstanding points" />
        <StatTile label="Points earned" value={num(d.pointsEarned30d)} sub="last 30 days" />
        <StatTile label="Points redeemed" value={num(d.pointsRedeemed30d)} sub="last 30 days" />
        <StatTile label="Orders" value={num(d.totalOrders30d)} sub="last 30 days" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">Members by tier</h3>
          <TierBars distribution={d.tierDistribution || []} />
        </Card>

        <Card className="p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Recent orders</h3>
            <Link to="/app/pos" className="text-xs font-medium text-brand-600 hover:underline">
              Open POS →
            </Link>
          </div>
          {recent.isPending ? (
            <Spinner label="Loading orders…" />
          ) : recent.data?.data?.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="pb-2 font-medium">Bill</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Earned</th>
                  <th className="pb-2 font-medium">Redeemed</th>
                  <th className="pb-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recent.data.data.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2.5 font-medium text-gray-800">{o.billId}</td>
                    <td className="py-2.5">{inr(o.totalAmount)}</td>
                    <td className="py-2.5"><Badge tone="green">+{num(o.pointsEarned)}</Badge></td>
                    <td className="py-2.5">{o.pointsBurned ? <Badge tone="amber">−{num(o.pointsBurned)}</Badge> : <span className="text-gray-300">—</span>}</td>
                    <td className="py-2.5 text-gray-500">{fmtDate(o.orderDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-6 text-center text-sm text-gray-400">No orders yet — ring up your first sale at the POS.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
