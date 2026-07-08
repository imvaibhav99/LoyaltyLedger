import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { apiMessage } from '../api/axios.js';
import {
  PageHeader, Button, Table, Badge, statusTone, Spinner, EmptyState,
  Modal, Field, Input, Select, ErrorNote, fmtDate,
} from '../components/ui.jsx';
import { IconPlus, IconSearch, IconChevronRight } from '../components/icons.jsx';

export function MemberForm({ initial = {}, onSubmit, busy, error, submitLabel = 'Save member' }) {
  const [form, setForm] = useState({
    name: initial.name || '',
    phone: initial.phone || '',
    email: initial.email || '',
    gender: initial.gender || '',
    city: initial.city || '',
    pinCode: initial.pinCode || '',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
    onSubmit(payload);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Full name">
          <Input required minLength={2} value={form.name} onChange={set('name')} placeholder="Priya Sharma" />
        </Field>
        <Field label="Phone">
          <Input required minLength={10} maxLength={15} value={form.phone} onChange={set('phone')} placeholder="9876543210" />
        </Field>
        <Field label="Email (optional)">
          <Input type="email" value={form.email} onChange={set('email')} placeholder="priya@mail.com" />
        </Field>
        <Field label="Gender (optional)">
          <Select value={form.gender} onChange={set('gender')}>
            <option value="">—</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field label="City (optional)">
          <Input value={form.city} onChange={set('city')} placeholder="Mumbai" />
        </Field>
        <Field label="PIN code (optional)">
          <Input pattern="\d{6}" value={form.pinCode} onChange={set('pinCode')} placeholder="400001" />
        </Field>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button>
      </div>
    </form>
  );
}

export default function Members() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');

  const members = useQuery({
    queryKey: ['members', query],
    queryFn: () =>
      api.get('/members', { params: { ...(query && { search: query }), limit: 25 } }).then((r) => r.data.data),
  });

  const createMember = useMutation({
    mutationFn: (payload) => api.post('/members', payload).then((r) => r.data.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      setModalOpen(false);
      setError('');
      navigate(`/app/members/${data.member.id}`);
    },
    onError: (err) => setError(apiMessage(err)),
  });

  const onSearch = (e) => {
    e.preventDefault();
    setQuery(search.trim());
  };

  return (
    <div>
      <PageHeader
        title="Members"
        subtitle="Your loyalty customers."
        actions={
          <Button onClick={() => { setError(''); setModalOpen(true); }}>
            <IconPlus size={16} /> Add member
          </Button>
        }
      />

      <form onSubmit={onSearch} className="mb-4 flex max-w-md items-center gap-2">
        <div className="relative flex-1">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <Button type="submit" variant="ghost">Search</Button>
      </form>

      {members.isPending ? (
        <Spinner />
      ) : members.isError ? (
        <ErrorNote>{apiMessage(members.error)}</ErrorNote>
      ) : (
        <Table
          head={['Member', 'Phone', 'Member ID', 'Status', 'Joined', '']}
          empty={
            !members.data.data.length && (
              <EmptyState title={query ? 'No members match your search.' : 'No members yet.'} hint="Enroll your first customer with “Add member”." />
            )
          }
        >
          {members.data.data.map((m) => (
            <tr
              key={m.id}
              onClick={() => navigate(`/app/members/${m.id}`)}
              className="cursor-pointer transition-colors hover:bg-gray-50"
            >
              <td className="px-4 py-3 font-medium text-gray-800">{m.name}</td>
              <td className="px-4 py-3 text-gray-600">{m.phone}</td>
              <td className="px-4 py-3 text-gray-500">{m.memberId}</td>
              <td className="px-4 py-3"><Badge tone={statusTone(m.status)}>{m.status}</Badge></td>
              <td className="px-4 py-3 text-gray-500">{fmtDate(m.createdAt)}</td>
              <td className="px-4 py-3 text-gray-300"><IconChevronRight size={16} /></td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add member" wide>
        <MemberForm
          onSubmit={(payload) => createMember.mutate(payload)}
          busy={createMember.isPending}
          error={error}
          submitLabel="Enroll member"
        />
      </Modal>
    </div>
  );
}
