import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { apiMessage } from '../api/axios.js';
import { useAuth, ROLES } from '../context/AuthContext.jsx';
import {
  PageHeader, Button, Table, Badge, statusTone, Spinner, ErrorNote, Modal, Field, Input, Select, EmptyState,
} from '../components/ui.jsx';
import { IconPlus } from '../components/icons.jsx';

const TYPES = ['FLAGSHIP', 'OUTLET', 'FRANCHISE', 'ONLINE'];

function StoreForm({ initial = {}, onSubmit, busy, error }) {
  const [form, setForm] = useState({
    name: initial.name || '',
    code: initial.code || '',
    city: initial.city || '',
    state: initial.state || '',
    pinCode: initial.pinCode || '',
    type: initial.type || 'OUTLET',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    onSubmit(Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Store name">
          <Input required minLength={2} value={form.name} onChange={set('name')} placeholder="MG Road Outlet" />
        </Field>
        <Field label="Store code (optional)" hint="Unique short code, e.g. MGR-01">
          <Input value={form.code} onChange={set('code')} placeholder="MGR-01" />
        </Field>
        <Field label="Type">
          <Select value={form.type} onChange={set('type')}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="City (optional)">
          <Input value={form.city} onChange={set('city')} placeholder="Bengaluru" />
        </Field>
        <Field label="State (optional)">
          <Input value={form.state} onChange={set('state')} placeholder="Karnataka" />
        </Field>
        <Field label="PIN code (optional)">
          <Input pattern="\d{6}" value={form.pinCode} onChange={set('pinCode')} placeholder="560001" />
        </Field>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save store'}</Button>
      </div>
    </form>
  );
}

export default function Stores() {
  const { user } = useAuth();
  const isOwner = user?.role === ROLES.MERCHANT_OWNER;
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');

  const stores = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.get('/stores', { params: { limit: 50 } }).then((r) => r.data.data),
  });

  const save = useMutation({
    mutationFn: ({ id, payload }) =>
      id ? api.put(`/stores/${id}`, payload) : api.post('/stores', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      setModal(null);
      setError('');
    },
    onError: (err) => setError(apiMessage(err)),
  });

  if (stores.isPending) return <Spinner />;
  if (stores.isError) return <ErrorNote>{apiMessage(stores.error)}</ErrorNote>;

  return (
    <div>
      <PageHeader
        title="Stores"
        subtitle="Locations where members enroll and earn."
        actions={isOwner && (
          <Button onClick={() => { setError(''); setModal('new'); }}>
            <IconPlus size={16} /> Add store
          </Button>
        )}
      />

      <Table
        head={['Store', 'Code', 'Type', 'City', 'Status', isOwner ? 'Actions' : '']}
        empty={!stores.data.data.length && (
          <EmptyState title="No stores yet." hint="Add your first location to tag orders and enrollments." />
        )}
      >
        {stores.data.data.map((s) => (
          <tr key={s.id}>
            <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
            <td className="px-4 py-3 text-gray-500">{s.code || '—'}</td>
            <td className="px-4 py-3"><Badge tone="navy">{s.type}</Badge></td>
            <td className="px-4 py-3 text-gray-600">{s.city || '—'}</td>
            <td className="px-4 py-3"><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
            <td className="px-4 py-3">
              {isOwner && (
                <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => { setError(''); setModal(s); }}>
                  Edit
                </Button>
              )}
            </td>
          </tr>
        ))}
      </Table>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'new' ? 'Add store' : `Edit ${modal?.name}`} wide>
        {modal && (
          <StoreForm
            initial={modal === 'new' ? {} : modal}
            onSubmit={(payload) => save.mutate({ id: modal === 'new' ? null : modal.id, payload })}
            busy={save.isPending}
            error={error}
          />
        )}
      </Modal>
    </div>
  );
}
