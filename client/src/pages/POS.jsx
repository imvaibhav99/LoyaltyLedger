import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { apiMessage } from '../api/axios.js';
import {
  PageHeader, Button, Card, Badge, ErrorNote, Field, Input, num, inr,
} from '../components/ui.jsx';
import { IconSearch, IconCheck, IconWallet } from '../components/icons.jsx';

export default function POS() {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [searched, setSearched] = useState('');
  const [selected, setSelected] = useState(null);
  const [billId, setBillId] = useState('');
  const [amount, setAmount] = useState('');
  const [redeem, setRedeem] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const search = useQuery({
    queryKey: ['pos-search', searched],
    queryFn: () => api.get('/members', { params: { search: searched, limit: 5 } }).then((r) => r.data.data),
    enabled: !!searched,
  });

  const detail = useQuery({
    queryKey: ['member', selected?.id],
    queryFn: () => api.get(`/members/${selected.id}`).then((r) => r.data.data),
    enabled: !!selected,
  });

  const createOrder = useMutation({
    mutationFn: (payload) =>
      api.post('/orders', payload, { headers: { 'Idempotency-Key': crypto.randomUUID() } }).then((r) => r.data.data),
    onSuccess: (data) => {
      setResult(data);
      setError('');
      setBillId('');
      setAmount('');
      setRedeem(false);
      setPointsToRedeem('');
      queryClient.invalidateQueries({ queryKey: ['member', selected?.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['ledger', selected?.id] });
    },
    onError: (err) => {
      setResult(null);
      setError(apiMessage(err));
    },
  });

  const balance = detail.data?.balance ?? 0;

  const submitOrder = (e) => {
    e.preventDefault();
    setError('');
    const payload = {
      memberId: selected.id,
      billId: billId.trim(),
      totalAmount: Number(amount),
      ...(redeem && Number(pointsToRedeem) > 0 && {
        walletUsed: true,
        pointsToRedeem: Number(pointsToRedeem),
      }),
    };
    createOrder.mutate(payload);
  };

  const pickMember = (m) => {
    setSelected(m);
    setResult(null);
    setError('');
  };

  return (
    <div>
      <PageHeader title="POS Counter" subtitle="Look up the customer, ring the bill, award or redeem points." />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── Left: member lookup ─────────────────────────── */}
        <div className="lg:col-span-2">
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-gray-800">1 · Find member</h3>
            <form
              onSubmit={(e) => { e.preventDefault(); setSearched(phone.trim()); setSelected(null); setResult(null); }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone or name…"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <Button type="submit" variant="ghost">Find</Button>
            </form>

            {search.isFetching && <p className="mt-3 text-sm text-gray-400">Searching…</p>}
            {search.data && !search.data.data.length && (
              <p className="mt-3 text-sm text-gray-400">No member found. Enroll them from the Members page first.</p>
            )}
            <div className="mt-3 space-y-2">
              {search.data?.data.map((m) => (
                <button
                  key={m.id}
                  onClick={() => pickMember(m)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    selected?.id === m.id
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span>
                    <span className="block font-medium text-gray-800">{m.name}</span>
                    <span className="text-xs text-gray-500">{m.phone} · {m.memberId}</span>
                  </span>
                  {selected?.id === m.id && <IconCheck size={16} className="text-brand-600" />}
                </button>
              ))}
            </div>
          </Card>

          {selected && (
            <Card className="mt-4 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{detail.data?.member?.name || selected.name}</div>
                  <div className="text-xs text-gray-500">{selected.phone}</div>
                </div>
                {detail.data?.tier && <Badge tone="blue">{detail.data.tier.name}</Badge>}
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-lg bg-navy-900 px-4 py-3 text-white">
                <IconWallet size={20} className="text-brand-500" />
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">Available points</div>
                  <div className="text-xl font-semibold">{num(balance)}</div>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* ── Right: order ────────────────────────────────── */}
        <div className="lg:col-span-3">
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-gray-800">2 · Create order</h3>
            {!selected ? (
              <p className="py-10 text-center text-sm text-gray-400">Select a member to start billing.</p>
            ) : (
              <form onSubmit={submitOrder} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Bill number">
                    <Input required value={billId} onChange={(e) => setBillId(e.target.value)} placeholder="BILL-0042" />
                  </Field>
                  <Field label="Bill amount (₹)">
                    <Input
                      required type="number" min="0" step="0.01"
                      value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500"
                    />
                  </Field>
                </div>

                <div className="rounded-lg border border-gray-200 p-4">
                  <label className="flex cursor-pointer items-center justify-between">
                    <span>
                      <span className="block text-sm font-medium text-gray-800">Redeem points</span>
                      <span className="text-xs text-gray-500">Customer has {num(balance)} points available</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={redeem}
                      onChange={(e) => setRedeem(e.target.checked)}
                      disabled={!balance}
                      className="h-5 w-5 accent-brand-600"
                    />
                  </label>
                  {redeem && (
                    <div className="mt-3">
                      <Field label={`Points to redeem (max ${num(balance)})`}>
                        <Input
                          required type="number" min="1" max={balance}
                          value={pointsToRedeem}
                          onChange={(e) => setPointsToRedeem(e.target.value)}
                          placeholder="20"
                        />
                      </Field>
                    </div>
                  )}
                </div>

                <ErrorNote>{error}</ErrorNote>

                <Button type="submit" disabled={createOrder.isPending} className="w-full justify-center py-3 text-base">
                  {createOrder.isPending ? 'Processing…' : 'Complete order'}
                </Button>
              </form>
            )}
          </Card>

          {result && (
            <Card className="mt-4 border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-2 text-emerald-800">
                <IconCheck size={18} />
                <span className="font-semibold">Order {result.billId} complete</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs uppercase tracking-wide text-emerald-700/70">Bill</div>
                  <div className="text-lg font-semibold text-emerald-900">{inr(result.totalAmount)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-emerald-700/70">Earned</div>
                  <div className="text-lg font-semibold text-emerald-900">+{num(result.pointsEarned)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-emerald-700/70">Redeemed</div>
                  <div className="text-lg font-semibold text-emerald-900">−{num(result.pointsBurned)}</div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
