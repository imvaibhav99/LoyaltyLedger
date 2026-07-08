import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { apiMessage } from '../api/axios.js';
import {
  PageHeader, Button, Card, Badge, Spinner, ErrorNote, Modal, Field, Input, Select, EmptyState,
} from '../components/ui.jsx';
import { IconPlus, IconShield, IconCheck } from '../components/icons.jsx';

const MODULES = ['members', 'transactions', 'analytics', 'programs', 'staff', 'roles', 'stores', 'billing', 'adjustments'];

function RoleForm({ onSubmit, busy, error }) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState(1);
  const [access, setAccess] = useState(
    Object.fromEntries(MODULES.map((m) => [m, { read: false, write: false }]))
  );

  const toggle = (m, k) =>
    setAccess((a) => {
      const next = { ...a[m], [k]: !a[m][k] };
      if (k === 'write' && next.write) next.read = true;
      return { ...a, [m]: next };
    });

  const submit = (e) => {
    e.preventDefault();
    const picked = Object.entries(access)
      .filter(([, v]) => v.read || v.write)
      .map(([module, v]) => ({ module, ...v }));
    onSubmit({ name, level: Number(level), access: picked });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Role name">
          <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Cashier" />
        </Field>
        <Field label="Level">
          <Select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value={1}>1 — Staff level</option>
            <option value={2}>2 — Manager level</option>
          </Select>
        </Field>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 text-left font-medium">Module</th>
              <th className="px-4 py-2.5 text-center font-medium">Read</th>
              <th className="px-4 py-2.5 text-center font-medium">Write</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {MODULES.map((m) => (
              <tr key={m}>
                <td className="px-4 py-2 capitalize text-gray-700">{m}</td>
                {['read', 'write'].map((k) => (
                  <td key={k} className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={access[m][k]}
                      onChange={() => toggle(m, k)}
                      className="h-4 w-4 accent-brand-600"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ErrorNote>{error}</ErrorNote>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create role'}</Button>
      </div>
    </form>
  );
}

export default function Roles() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');

  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get('/roles').then((r) => r.data.data.data),
  });

  const create = useMutation({
    mutationFn: (payload) => api.post('/roles', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setModalOpen(false);
      setError('');
    },
    onError: (err) => setError(apiMessage(err)),
  });

  if (roles.isPending) return <Spinner />;
  if (roles.isError) return <ErrorNote>{apiMessage(roles.error)}</ErrorNote>;

  return (
    <div>
      <PageHeader
        title="Roles"
        subtitle="Permission sets you assign to managers and staff."
        actions={
          <Button onClick={() => { setError(''); setModalOpen(true); }}>
            <IconPlus size={16} /> Add role
          </Button>
        }
      />

      {!roles.data.length ? (
        <Card>
          <EmptyState title="No roles yet." hint="Create a role like “Cashier” with members + transactions access, then assign it on the Team page." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.data.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <IconShield size={18} />
                  </span>
                  <div className="font-semibold text-gray-900">{r.name}</div>
                </div>
                <Badge tone={r.level === 2 ? 'blue' : 'gray'}>Level {r.level}</Badge>
              </div>
              <ul className="mt-4 space-y-1.5 text-sm">
                {r.access.map((a) => (
                  <li key={a.module} className="flex items-center justify-between">
                    <span className="capitalize text-gray-600">{a.module}</span>
                    <span className="flex gap-1.5">
                      {a.read && <Badge tone="gray">read</Badge>}
                      {a.write && <Badge tone="green">write</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add role" wide>
        <RoleForm onSubmit={(payload) => create.mutate(payload)} busy={create.isPending} error={error} />
      </Modal>
    </div>
  );
}
