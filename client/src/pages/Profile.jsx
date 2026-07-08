import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { apiMessage } from '../api/axios.js';
import { useAuth, ROLES } from '../context/AuthContext.jsx';
import {
  PageHeader, Button, Card, Badge, Spinner, ErrorNote, Field, Input, fmtDate,
} from '../components/ui.jsx';
import { IconCheck } from '../components/icons.jsx';

function SavedNote({ show }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
      <IconCheck size={15} /> Saved
    </span>
  );
}

export default function Profile() {
  const { user, logout, updateUser, updateTenant } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOwner = user?.role === ROLES.MERCHANT_OWNER;

  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get('/profile').then((r) => r.data.data),
  });

  // account form
  const [account, setAccount] = useState(null);
  const [accountError, setAccountError] = useState('');
  const [accountSaved, setAccountSaved] = useState(false);

  // password form
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwError, setPwError] = useState('');

  // business form
  const [biz, setBiz] = useState(null);
  const [bizError, setBizError] = useState('');
  const [bizSaved, setBizSaved] = useState(false);

  const saveAccount = useMutation({
    mutationFn: (payload) => api.put('/profile', payload).then((r) => r.data.data),
    onSuccess: (data) => {
      updateUser({ name: data.user.name, email: data.user.email });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setAccountError('');
      setAccountSaved(true);
      setTimeout(() => setAccountSaved(false), 2500);
    },
    onError: (err) => setAccountError(apiMessage(err)),
  });

  const savePassword = useMutation({
    mutationFn: (payload) => api.put('/profile/password', payload),
    onSuccess: async () => {
      await logout();
      navigate('/login', { replace: true });
    },
    onError: (err) => setPwError(apiMessage(err)),
  });

  const saveBusiness = useMutation({
    mutationFn: (payload) => api.put('/profile/business', payload).then((r) => r.data.data),
    onSuccess: (data) => {
      updateTenant(data.tenant);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setBizError('');
      setBizSaved(true);
      setTimeout(() => setBizSaved(false), 2500);
    },
    onError: (err) => setBizError(apiMessage(err)),
  });

  if (profile.isPending) return <Spinner />;
  if (profile.isError) return <ErrorNote>{apiMessage(profile.error)}</ErrorNote>;

  const { user: u, tenant } = profile.data;
  const acct = account ?? { name: u.name, email: u.email };
  const bizForm = biz ?? { businessName: tenant?.businessName || '', billingEmail: tenant?.billingEmail || '' };

  return (
    <div className="max-w-2xl">
      <PageHeader title="My Profile" subtitle="Your account and business settings." />

      <div className="space-y-6">
        {/* ── Account ─────────────────────────────────── */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Account</h3>
            <SavedNote show={accountSaved} />
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); saveAccount.mutate(acct); }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name">
                <Input required minLength={2} value={acct.name} onChange={(e) => setAccount({ ...acct, name: e.target.value })} />
              </Field>
              <Field label="Email" hint="You'll use this to log in">
                <Input type="email" required value={acct.email} onChange={(e) => setAccount({ ...acct, email: e.target.value })} />
              </Field>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Role: <Badge tone="brand">{u.role}</Badge> · member since {fmtDate(u.createdAt)}</span>
              <Button type="submit" disabled={saveAccount.isPending}>
                {saveAccount.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
            <ErrorNote>{accountError}</ErrorNote>
          </form>
        </Card>

        {/* ── Password ────────────────────────────────── */}
        <Card className="p-5">
          <h3 className="mb-1 text-sm font-semibold text-gray-800">Change password</h3>
          <p className="mb-4 text-xs text-gray-400">
            Changing your password logs you out everywhere — you'll sign in again with the new one.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pw.newPassword !== pw.confirm) {
                setPwError('New passwords do not match');
                return;
              }
              setPwError('');
              savePassword.mutate({ currentPassword: pw.currentPassword, newPassword: pw.newPassword });
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Current password">
                <Input type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
              </Field>
              <Field label="New password">
                <Input type="password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
              </Field>
              <Field label="Confirm new password">
                <Input type="password" required minLength={8} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
              </Field>
            </div>
            <ErrorNote>{pwError}</ErrorNote>
            <div className="flex justify-end">
              <Button type="submit" variant="dark" disabled={savePassword.isPending}>
                {savePassword.isPending ? 'Updating…' : 'Update password'}
              </Button>
            </div>
          </form>
        </Card>

        {/* ── Business (owner only) ───────────────────── */}
        {isOwner && tenant && (
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Business</h3>
              <SavedNote show={bizSaved} />
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); saveBusiness.mutate(bizForm); }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <Field label="Business name">
                  <Input required minLength={2} value={bizForm.businessName} onChange={(e) => setBiz({ ...bizForm, businessName: e.target.value })} />
                </Field>
                <Field label="Billing email">
                  <Input type="email" value={bizForm.billingEmail} onChange={(e) => setBiz({ ...bizForm, billingEmail: e.target.value })} />
                </Field>
              </div>
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>
                  Plan: <Badge tone="navy">{tenant.plan}</Badge> · slug <span className="font-mono text-xs">{tenant.slug}</span> · since {fmtDate(tenant.createdAt)}
                </span>
                <Button type="submit" disabled={saveBusiness.isPending}>
                  {saveBusiness.isPending ? 'Saving…' : 'Save business'}
                </Button>
              </div>
              <ErrorNote>{bizError}</ErrorNote>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
