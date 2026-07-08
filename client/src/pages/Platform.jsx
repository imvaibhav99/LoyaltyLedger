import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { apiMessage } from '../api/axios.js';
import {
  PageHeader, Button, Table, Badge, statusTone, Spinner, ErrorNote, Modal, EmptyState, num, fmtDate,
} from '../components/ui.jsx';

function InfoRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-800">{children}</span>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-0.5 text-xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

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

  const t = detail.data?.tenant ?? tenant;
  const owner = detail.data?.owner;
  const staff = detail.data?.staff ?? [];
  const s = detail.data?.stats;
  const status = t.status;

  return (
    <div className="space-y-4">
      {detail.isPending ? (
        <Spinner label="Loading tenant…" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Business</h4>
              <InfoRow label="Name">{t.businessName}</InfoRow>
              <InfoRow label="Slug">{t.slug}</InfoRow>
              <InfoRow label="Plan"><Badge tone="navy">{t.plan}</Badge></InfoRow>
              <InfoRow label="Billing email">{t.billingEmail || '—'}</InfoRow>
              <InfoRow label="Joined">{fmtDate(t.createdAt)}</InfoRow>
              <InfoRow label="Status"><Badge tone={statusTone(status)}>{status}</Badge></InfoRow>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Owner account</h4>
              {owner ? (
                <>
                  <InfoRow label="Name">{owner.name}</InfoRow>
                  <InfoRow label="Email">{owner.email}</InfoRow>
                  <InfoRow label="Account status"><Badge tone={statusTone(owner.status)}>{owner.status}</Badge></InfoRow>
                  <InfoRow label="Created">{fmtDate(owner.createdAt)}</InfoRow>
                </>
              ) : (
                <p className="py-4 text-sm text-gray-400">No owner account found.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <MiniStat label="Members" value={num(s?.memberCount)} />
            <MiniStat label="Orders" value={num(s?.orderCount)} />
            <MiniStat label="Pts owed" value={num(s?.pointsLiability)} />
            <MiniStat label="Staff" value={num(s?.staffCount)} />
            <MiniStat label="Stores" value={num(s?.storeCount)} />
            <MiniStat label="Rules" value={num(s?.earnRuleCount)} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-2.5 text-sm">
            <span className="text-gray-500">Last order</span>
            <span className="font-medium text-gray-800">
              {s?.lastOrderAt ? `${fmtDate(s.lastOrderAt)} · ₹${num(s.lastOrderAmount)}` : 'No orders yet'}
            </span>
          </div>

          {staff.length > 0 && (
            <div className="rounded-lg border border-gray-200 p-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Team ({staff.length})
              </h4>
              <ul className="divide-y divide-gray-100">
                {staff.map((u) => (
                  <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      <span className="font-medium text-gray-800">{u.name}</span>
                      <span className="ml-2 text-gray-400">{u.email}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={u.role === 'MERCHANT_MANAGER' ? 'blue' : 'gray'}>
                        {u.role === 'MERCHANT_MANAGER' ? 'Manager' : 'Staff'}
                      </Badge>
                      <Badge tone={statusTone(u.status)}>{u.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

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

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.businessName || ''} wide>
        {selected && <TenantDetail tenant={selected} onClose={() => setSelected(null)} />}
      </Modal>
    </div>
  );
}
