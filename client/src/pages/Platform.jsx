import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { apiMessage } from '../api/axios.js';
import {
  PageHeader, Button, Table, Badge, statusTone, Spinner, ErrorNote, Modal, EmptyState, num, fmtDate,
} from '../components/ui.jsx';

function TenantDetail({ tenant, onClose }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const detail = useQuery({
    queryKey: ['tenant', tenant.id],
    queryFn: () => api.get(`/platform/tenants/${tenant.id}`).then((r) => r.data.data),
  });

  const setStatus = useMutation({
    mutationFn: (status) => api.patch(`/platform/tenants/${tenant.id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenant', tenant.id] });
      setError('');
      onClose();
    },
    onError: (err) => setError(apiMessage(err)),
  });

  const s = detail.data?.stats;
  const status = detail.data?.tenant?.status ?? tenant.status;

  return (
    <div className="space-y-4">
      {detail.isPending ? (
        <Spinner label="Loading stats…" />
      ) : (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-400">Members</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">{num(s?.memberCount)}</div>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-400">Orders</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">{num(s?.orderCount)}</div>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-400">Pts liability</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">{num(s?.pointsLiability)}</div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm">
        <span className="text-gray-600">Current status</span>
        <Badge tone={statusTone(status)}>{status}</Badge>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="flex justify-end gap-2">
        {status !== 'active' && (
          <Button disabled={setStatus.isPending} onClick={() => setStatus.mutate('active')}>
            Activate
          </Button>
        )}
        {status === 'active' && (
          <Button
            variant="danger"
            disabled={setStatus.isPending}
            onClick={() =>
              window.confirm(`Suspend ${tenant.businessName}? Their loyalty program will be flagged inactive.`) &&
              setStatus.mutate('suspended')
            }
          >
            Suspend
          </Button>
        )}
        {status !== 'cancelled' && (
          <Button
            variant="ghost"
            disabled={setStatus.isPending}
            onClick={() =>
              window.confirm(`Cancel ${tenant.businessName}? This marks the account as churned.`) &&
              setStatus.mutate('cancelled')
            }
          >
            Cancel account
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Platform() {
  const [selected, setSelected] = useState(null);

  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.get('/platform/tenants', { params: { limit: 50 } }).then((r) => r.data.data),
  });

  if (tenants.isPending) return <Spinner />;
  if (tenants.isError) return <ErrorNote>{apiMessage(tenants.error)}</ErrorNote>;

  return (
    <div>
      <PageHeader title="Tenants" subtitle="Every business running on LoyaltyLedger." />

      <Table
        head={['Business', 'Slug', 'Plan', 'Status', 'Joined', '']}
        empty={!tenants.data.data.length && <EmptyState title="No tenants yet." hint="Businesses appear here as they sign up." />}
      >
        {tenants.data.data.map((t) => (
          <tr key={t.id} className="transition-colors hover:bg-gray-50">
            <td className="px-4 py-3 font-medium text-gray-800">{t.businessName}</td>
            <td className="px-4 py-3 text-gray-500">{t.slug}</td>
            <td className="px-4 py-3"><Badge tone="navy">{t.plan}</Badge></td>
            <td className="px-4 py-3"><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
            <td className="px-4 py-3 text-gray-500">{fmtDate(t.createdAt)}</td>
            <td className="px-4 py-3">
              <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => setSelected(t)}>
                Manage
              </Button>
            </td>
          </tr>
        ))}
      </Table>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.businessName || ''}>
        {selected && <TenantDetail tenant={selected} onClose={() => setSelected(null)} />}
      </Modal>
    </div>
  );
}
