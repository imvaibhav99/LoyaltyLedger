import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { apiMessage } from '../api/axios.js';
import {
  PageHeader, Button, Card, Badge, statusTone, Spinner, ErrorNote,
  Modal, num, fmtDate, EmptyState,
} from '../components/ui.jsx';
import { MemberForm } from './Members.jsx';
import { IconArrowLeft, IconWallet, IconTiers } from '../components/icons.jsx';

const conclusionTone = { ACTIVE: 'green', REDEEMED: 'blue', EXPIRED: 'gray', ROLLBACK: 'red' };

export default function MemberDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState('');

  const member = useQuery({
    queryKey: ['member', id],
    queryFn: () => api.get(`/members/${id}`).then((r) => r.data.data),
  });

  const ledger = useQuery({
    queryKey: ['ledger', id],
    queryFn: () => api.get(`/analytics/ledger/${id}`, { params: { limit: 25 } }).then((r) => r.data.data),
  });

  const updateMember = useMutation({
    mutationFn: (payload) => api.put(`/members/${id}`, payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member', id] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      setEditOpen(false);
      setError('');
    },
    onError: (err) => setError(apiMessage(err)),
  });

  if (member.isPending) return <Spinner />;
  if (member.isError) return <ErrorNote>{apiMessage(member.error)}</ErrorNote>;

  const { member: m, balance, tier, tierExpiryDate } = member.data;

  return (
    <div>
      <Link to="/app/members" className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <IconArrowLeft size={15} /> All members
      </Link>

      <PageHeader
        title={m.name}
        subtitle={`${m.memberId} · joined ${fmtDate(m.createdAt)}`}
        actions={<Button variant="ghost" onClick={() => { setError(''); setEditOpen(true); }}>Edit profile</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <IconWallet size={20} />
            </span>
            <div>
              <div className="text-sm text-gray-500">Points balance</div>
              <div className="text-2xl font-semibold text-gray-900">{num(balance)}</div>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-viz-blue">
              <IconTiers size={20} />
            </span>
            <div>
              <div className="text-sm text-gray-500">Tier</div>
              <div className="text-2xl font-semibold text-gray-900">{tier?.name || '—'}</div>
              {tierExpiryDate && <div className="text-xs text-gray-400">until {fmtDate(tierExpiryDate)}</div>}
            </div>
          </div>
        </Card>
        <Card className="p-5 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <span className="text-gray-500">Phone</span><span className="text-gray-800">{m.phone}</span>
            <span className="text-gray-500">Email</span><span className="text-gray-800">{m.email || '—'}</span>
            <span className="text-gray-500">City</span><span className="text-gray-800">{m.city || '—'}</span>
            <span className="text-gray-500">Status</span><span><Badge tone={statusTone(m.status)}>{m.status}</Badge></span>
          </div>
        </Card>
      </div>

      <h3 className="mb-3 mt-8 text-sm font-semibold text-gray-800">Points history</h3>
      {ledger.isPending ? (
        <Spinner label="Loading ledger…" />
      ) : ledger.isError ? (
        <ErrorNote>{apiMessage(ledger.error)}</ErrorNote>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  {['Type', 'Points', 'Remaining', 'Status', 'Source', 'Expires', 'Date'].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ledger.data.data.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3">
                      <Badge tone={e.type === 'CREDIT' ? 'green' : 'amber'}>{e.type}</Badge>
                    </td>
                    <td className={`px-4 py-3 font-medium ${e.type === 'CREDIT' ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {e.type === 'CREDIT' ? '+' : '−'}{num(e.points)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{e.type === 'CREDIT' ? num(e.remainingPoints) : '—'}</td>
                    <td className="px-4 py-3"><Badge tone={conclusionTone[e.conclusion] || 'gray'}>{e.conclusion}</Badge></td>
                    <td className="px-4 py-3 text-gray-500">{e.source || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{e.pointExpiryDate ? fmtDate(e.pointExpiryDate) : '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!ledger.data.data.length && (
              <EmptyState title="No transactions yet." hint="Points activity will appear here after the first order." />
            )}
          </div>
        </Card>
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit member" wide>
        <MemberForm
          initial={m}
          onSubmit={(payload) => updateMember.mutate(payload)}
          busy={updateMember.isPending}
          error={error}
        />
      </Modal>
    </div>
  );
}
