import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { apiMessage } from '../api/axios.js';
import {
  PageHeader, Button, Table, Badge, statusTone, Spinner, ErrorNote, Modal, Field, Input, PasswordInput, Select, EmptyState, fmtDate,
} from '../components/ui.jsx';
import { IconPlus } from '../components/icons.jsx';

function StaffForm({ roles, onSubmit, busy, error }) {
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'MERCHANT_STAFF', roleId: '',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    onSubmit({ ...form, ...(form.roleId ? {} : { roleId: undefined }) });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Full name">
          <Input required minLength={2} value={form.name} onChange={set('name')} placeholder="Amit Kumar" />
        </Field>
        <Field label="Email">
          <Input type="email" required value={form.email} onChange={set('email')} placeholder="amit@business.com" />
        </Field>
        <Field label="Password" hint="They can use this to log in; minimum 8 characters">
          <PasswordInput required minLength={8} value={form.password} onChange={set('password')} />
        </Field>
        <Field label="Account type">
          <Select value={form.role} onChange={set('role')}>
            <option value="MERCHANT_STAFF">Staff (POS operator)</option>
            <option value="MERCHANT_MANAGER">Manager</option>
          </Select>
        </Field>
      </div>
      <Field label="Permission role" hint="Controls what they can read/write — create roles on the Roles page">
        <Select value={form.roleId} onChange={set('roleId')}>
          <option value="">No role assigned</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name} (level {r.level})</option>)}
        </Select>
      </Field>
      {!form.roleId && (
        <p className="text-xs text-amber-600">⚠ Without a permission role, this account cannot access members or POS.</p>
      )}
      <ErrorNote>{error}</ErrorNote>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</Button>
      </div>
    </form>
  );
}

export default function Team() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');

  const staff = useQuery({
    queryKey: ['staff'],
    queryFn: () => api.get('/staff').then((r) => r.data.data.data),
  });
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get('/roles').then((r) => r.data.data.data),
  });

  const create = useMutation({
    mutationFn: (payload) => api.post('/staff', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setModalOpen(false);
      setError('');
    },
    onError: (err) => setError(apiMessage(err)),
  });

  const deactivate = useMutation({
    mutationFn: (id) => api.delete(`/staff/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  });

  if (staff.isPending) return <Spinner />;
  if (staff.isError) return <ErrorNote>{apiMessage(staff.error)}</ErrorNote>;

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Manager and staff accounts for your business."
        actions={
          <Button onClick={() => { setError(''); setModalOpen(true); }}>
            <IconPlus size={16} /> Add team member
          </Button>
        }
      />

      <Table
        head={['Name', 'Email', 'Emp ID', 'Account type', 'Permission role', 'Status', 'Since', 'Actions']}
        empty={!staff.data.length && (
          <EmptyState title="No team members yet." hint="Create staff accounts so cashiers can run the POS." />
        )}
      >
        {staff.data.map((u) => (
          <tr key={u.id}>
            <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
            <td className="px-4 py-3 text-gray-600">{u.email}</td>
            <td className="px-4 py-3 text-gray-500">{u.empId || '—'}</td>
            <td className="px-4 py-3">
              <Badge tone={u.role === 'MERCHANT_MANAGER' ? 'blue' : 'gray'}>
                {u.role === 'MERCHANT_MANAGER' ? 'Manager' : 'Staff'}
              </Badge>
            </td>
            <td className="px-4 py-3 text-gray-600">{u.roleId?.name || '—'}</td>
            <td className="px-4 py-3"><Badge tone={statusTone(u.status)}>{u.status}</Badge></td>
            <td className="px-4 py-3 text-gray-500">{fmtDate(u.createdAt)}</td>
            <td className="px-4 py-3">
              {u.status === 'active' && (
                <Button
                  variant="danger" className="px-3 py-1 text-xs"
                  disabled={deactivate.isPending}
                  onClick={() => window.confirm(`Deactivate ${u.name}? They will no longer be able to log in.`) && deactivate.mutate(u.id)}
                >
                  Deactivate
                </Button>
              )}
            </td>
          </tr>
        ))}
      </Table>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add team member" wide>
        <StaffForm
          roles={roles.data || []}
          onSubmit={(payload) => create.mutate(payload)}
          busy={create.isPending}
          error={error}
        />
      </Modal>
    </div>
  );
}
