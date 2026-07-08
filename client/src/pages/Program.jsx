import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { apiMessage } from '../api/axios.js';
import { useAuth, ROLES } from '../context/AuthContext.jsx';
import {
  PageHeader, Button, Table, Badge, Spinner, ErrorNote, Modal, Field, Input, Select, EmptyState, num,
} from '../components/ui.jsx';
import { IconPlus } from '../components/icons.jsx';

function RuleForm({ initial = {}, tiers, onSubmit, busy, error }) {
  const [form, setForm] = useState({
    name: initial.name || '',
    tierId: initial.tierId || '',
    transactionUnit: initial.transactionUnit ?? 10,
    pointsPerUnit: initial.pointsPerUnit ?? 1,
    maxPoints: initial.maxPoints ?? '',
    expiryDays: initial.expiryDays ?? 90,
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      name: form.name,
      tierId: form.tierId || null,
      transactionUnit: Number(form.transactionUnit),
      pointsPerUnit: Number(form.pointsPerUnit),
      ...(form.maxPoints !== '' && { maxPoints: Number(form.maxPoints) }),
      expiryDays: Number(form.expiryDays),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Rule name">
        <Input required value={form.name} onChange={set('name')} placeholder="Base earning" />
      </Field>
      <Field label="Applies to tier">
        <Select value={form.tierId} onChange={set('tierId')}>
          <option value="">All tiers (catch-all)</option>
          {tiers.map((t) => <option key={t.id} value={t.id}>{t.name} only</option>)}
        </Select>
      </Field>
      <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
        Earn <span className="font-semibold text-gray-900">{form.pointsPerUnit || '?'} point{Number(form.pointsPerUnit) > 1 ? 's' : ''}</span> for
        every <span className="font-semibold text-gray-900">₹{form.transactionUnit || '?'}</span> spent
        {form.maxPoints !== '' && Number(form.maxPoints) > 0 && <> · capped at <span className="font-semibold text-gray-900">{form.maxPoints} pts/bill</span></>}
        {' '}· expires in <span className="font-semibold text-gray-900">{form.expiryDays || '?'} days</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Per ₹ spent (unit)">
          <Input required type="number" min="1" value={form.transactionUnit} onChange={set('transactionUnit')} />
        </Field>
        <Field label="Points per unit">
          <Input required type="number" min="1" value={form.pointsPerUnit} onChange={set('pointsPerUnit')} />
        </Field>
        <Field label="Max points per bill" hint="Leave empty for no cap">
          <Input type="number" min="0" value={form.maxPoints} onChange={set('maxPoints')} placeholder="No cap" />
        </Field>
        <Field label="Points expire after (days)">
          <Input required type="number" min="1" value={form.expiryDays} onChange={set('expiryDays')} />
        </Field>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save rule'}</Button>
      </div>
    </form>
  );
}

export default function Program() {
  const { user } = useAuth();
  const isOwner = user?.role === ROLES.MERCHANT_OWNER;
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');

  const rules = useQuery({
    queryKey: ['earn-rules'],
    queryFn: () => api.get('/earn-rules').then((r) => r.data.data.data),
  });
  const tiers = useQuery({
    queryKey: ['tiers'],
    queryFn: () => api.get('/tiers').then((r) => r.data.data.data),
  });

  const save = useMutation({
    mutationFn: ({ id, payload }) =>
      id ? api.put(`/earn-rules/${id}`, payload) : api.post('/earn-rules', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['earn-rules'] });
      setModal(null);
      setError('');
    },
    onError: (err) => setError(apiMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/earn-rules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['earn-rules'] }),
  });

  if (rules.isPending || tiers.isPending) return <Spinner />;
  if (rules.isError) return <ErrorNote>{apiMessage(rules.error)}</ErrorNote>;

  const tierName = (id) => tiers.data?.find((t) => t.id === id)?.name || 'Unknown tier';

  return (
    <div>
      <PageHeader
        title="Earn Rules"
        subtitle="How your members earn points on every purchase."
        actions={isOwner && (
          <Button onClick={() => { setError(''); setModal('new'); }}>
            <IconPlus size={16} /> Add rule
          </Button>
        )}
      />

      <Table
        head={['Rule', 'Applies to', 'Earning rate', 'Cap / bill', 'Expiry', isOwner ? 'Actions' : '']}
        empty={!rules.data.length && (
          <EmptyState title="No earn rules yet." hint="Without an active rule, orders award zero points." />
        )}
      >
        {rules.data.map((r) => (
          <tr key={r.id}>
            <td className="px-4 py-3 font-medium text-gray-800">{r.name}</td>
            <td className="px-4 py-3">
              {r.tierId ? <Badge tone="blue">{tierName(r.tierId)}</Badge> : <Badge tone="gray">All tiers</Badge>}
            </td>
            <td className="px-4 py-3 text-gray-700">{r.pointsPerUnit} pt / ₹{r.transactionUnit}</td>
            <td className="px-4 py-3 text-gray-600">{r.maxPoints ? num(r.maxPoints) : 'No cap'}</td>
            <td className="px-4 py-3 text-gray-600">{r.expiryDays} days</td>
            <td className="px-4 py-3">
              {isOwner && (
                <span className="flex gap-2">
                  <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => { setError(''); setModal(r); }}>Edit</Button>
                  <Button
                    variant="danger" className="px-3 py-1 text-xs"
                    disabled={remove.isPending}
                    onClick={() => window.confirm(`Deactivate rule “${r.name}”?`) && remove.mutate(r.id)}
                  >
                    Deactivate
                  </Button>
                </span>
              )}
            </td>
          </tr>
        ))}
      </Table>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'new' ? 'Add earn rule' : `Edit ${modal?.name}`} wide>
        {modal && (
          <RuleForm
            initial={modal === 'new' ? {} : modal}
            tiers={tiers.data || []}
            onSubmit={(payload) => save.mutate({ id: modal === 'new' ? null : modal.id, payload })}
            busy={save.isPending}
            error={error}
          />
        )}
      </Modal>
    </div>
  );
}
