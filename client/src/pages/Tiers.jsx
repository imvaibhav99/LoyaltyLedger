import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { apiMessage } from '../api/axios.js';
import { useAuth, ROLES } from '../context/AuthContext.jsx';
import {
  PageHeader, Button, Card, Badge, Spinner, ErrorNote, Modal, Field, Input, Select, EmptyState, num,
} from '../components/ui.jsx';
import { IconPlus, IconTiers } from '../components/icons.jsx';

const DURATIONS = ['DAILY', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'CALENDER_YEARLY', 'FINANCIAL_YEARLY'];
const durationLabel = {
  DAILY: 'days', MONTHLY: 'months', QUARTERLY: 'quarters',
  HALF_YEARLY: 'half-years', CALENDER_YEARLY: 'years', FINANCIAL_YEARLY: 'financial years',
};

function TierForm({ initial = {}, tiers, onSubmit, busy, error }) {
  const [form, setForm] = useState({
    name: initial.name || '',
    isDefault: initial.isDefault || false,
    durationType: initial.durationType || 'MONTHLY',
    duration: initial.duration ?? 12,
    pointsMultiplier: initial.pointsMultiplier ?? 1,
    upgradePolicyTierId: initial.upgradePolicyTierId || '',
    upgradeSpends: initial.upgradeSpends ?? '',
    upgradeVisits: initial.upgradeVisits ?? '',
    upgradeRule: initial.upgradeRule || 'OR',
  });
  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      isDefault: form.isDefault,
      durationType: form.durationType,
      duration: Number(form.duration),
      pointsMultiplier: Number(form.pointsMultiplier),
    };
    if (form.upgradePolicyTierId) {
      payload.upgradePolicyTierId = form.upgradePolicyTierId;
      payload.upgradeRule = form.upgradeRule;
      if (form.upgradeSpends !== '') payload.upgradeSpends = Number(form.upgradeSpends);
      if (form.upgradeVisits !== '') payload.upgradeVisits = Number(form.upgradeVisits);
    }
    onSubmit(payload);
  };

  const others = tiers.filter((t) => t.id !== initial.id);

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Tier name">
          <Input required value={form.name} onChange={set('name')} placeholder="Gold" />
        </Field>
        <Field label="Points multiplier" hint="Gold at 2× earns double points">
          <Input required type="number" min="1" step="0.5" value={form.pointsMultiplier} onChange={set('pointsMultiplier')} />
        </Field>
        <Field label="Membership window">
          <Select value={form.durationType} onChange={set('durationType')}>
            {DURATIONS.map((d) => <option key={d} value={d}>{d.replaceAll('_', ' ')}</option>)}
          </Select>
        </Field>
        <Field label={`Duration (${durationLabel[form.durationType]})`}>
          <Input required type="number" min="1" value={form.duration} onChange={set('duration')} />
        </Field>
      </div>

      <label className="flex items-center gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5 text-sm">
        <input type="checkbox" checked={form.isDefault} onChange={set('isDefault')} className="h-4 w-4 accent-brand-600" />
        <span>
          <span className="font-medium text-gray-800">Default tier</span>
          <span className="block text-xs text-gray-500">New members are enrolled here automatically</span>
        </span>
      </label>

      <div className="rounded-lg border border-gray-200 p-4">
        <p className="mb-3 text-sm font-medium text-gray-800">Upgrade policy (optional)</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Upgrades to">
            <Select value={form.upgradePolicyTierId} onChange={set('upgradePolicyTierId')}>
              <option value="">— no upgrade —</option>
              {others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Rule">
            <Select value={form.upgradeRule} onChange={set('upgradeRule')} disabled={!form.upgradePolicyTierId}>
              <option value="OR">Any threshold (OR)</option>
              <option value="AND">All thresholds (AND)</option>
            </Select>
          </Field>
          <Field label="Spend threshold (₹)">
            <Input type="number" min="0" value={form.upgradeSpends} onChange={set('upgradeSpends')} disabled={!form.upgradePolicyTierId} placeholder="5000" />
          </Field>
          <Field label="Visit threshold">
            <Input type="number" min="0" value={form.upgradeVisits} onChange={set('upgradeVisits')} disabled={!form.upgradePolicyTierId} placeholder="10" />
          </Field>
        </div>
        {form.upgradePolicyTierId && form.upgradeSpends === '' && form.upgradeVisits === '' && (
          <p className="mt-2 text-xs text-amber-600">⚠ Set at least one threshold — with none, every order qualifies for upgrade.</p>
        )}
      </div>

      <ErrorNote>{error}</ErrorNote>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save tier'}</Button>
      </div>
    </form>
  );
}

export default function Tiers() {
  const { user } = useAuth();
  const isOwner = user?.role === ROLES.MERCHANT_OWNER;
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null); // null | 'new' | tier object
  const [error, setError] = useState('');

  const tiers = useQuery({
    queryKey: ['tiers'],
    queryFn: () => api.get('/tiers').then((r) => r.data.data.data),
  });

  const save = useMutation({
    mutationFn: ({ id, payload }) =>
      id ? api.put(`/tiers/${id}`, payload) : api.post('/tiers', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tiers'] });
      setModal(null);
      setError('');
    },
    onError: (err) => setError(apiMessage(err)),
  });

  if (tiers.isPending) return <Spinner />;
  if (tiers.isError) return <ErrorNote>{apiMessage(tiers.error)}</ErrorNote>;

  const list = tiers.data;
  const nameOf = (id) => list.find((t) => t.id === id)?.name || '?';

  return (
    <div>
      <PageHeader
        title="Tiers"
        subtitle="Levels your members climb — higher tiers earn faster."
        actions={isOwner && (
          <Button onClick={() => { setError(''); setModal('new'); }}>
            <IconPlus size={16} /> Add tier
          </Button>
        )}
      />

      {!list.length ? (
        <Card><EmptyState title="No tiers yet." hint="Create a default tier first — e.g. Bronze — so new members land somewhere." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => (
            <Card key={t.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-viz-blue">
                    <IconTiers size={18} />
                  </span>
                  <div>
                    <div className="font-semibold text-gray-900">{t.name}</div>
                    <div className="text-xs text-gray-500">{t.pointsMultiplier}× points</div>
                  </div>
                </div>
                {t.isDefault && <Badge tone="brand">Default</Badge>}
              </div>
              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-gray-500">Window</dt><dd className="text-gray-800">{t.duration} {durationLabel[t.durationType]}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Upgrades to</dt><dd className="text-gray-800">{t.upgradePolicyTierId ? nameOf(t.upgradePolicyTierId) : '—'}</dd></div>
                {t.upgradePolicyTierId && (
                  <div className="flex justify-between"><dt className="text-gray-500">Thresholds</dt>
                    <dd className="text-gray-800">
                      {[t.upgradeSpends ? `₹${num(t.upgradeSpends)}` : null, t.upgradeVisits ? `${t.upgradeVisits} visits` : null].filter(Boolean).join(` ${t.upgradeRule} `) || 'none set'}
                    </dd>
                  </div>
                )}
              </dl>
              {isOwner && (
                <Button variant="ghost" className="mt-4 w-full justify-center" onClick={() => { setError(''); setModal(t); }}>
                  Edit
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'new' ? 'Add tier' : `Edit ${modal?.name}`} wide>
        {modal && (
          <TierForm
            initial={modal === 'new' ? {} : modal}
            tiers={list}
            onSubmit={(payload) => save.mutate({ id: modal === 'new' ? null : modal.id, payload })}
            busy={save.isPending}
            error={error}
          />
        )}
      </Modal>
    </div>
  );
}
