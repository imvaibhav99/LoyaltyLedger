import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { apiMessage } from '../api/axios.js';
import { Button, Field, Input, PasswordInput, Select, ErrorNote } from '../components/ui.jsx';
import { AuthShell } from './Login.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    businessName: '',
    ownerName: '',
    email: '',
    password: '',
    plan: 'starter',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(form);
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-semibold text-gray-900">Create your program</h2>
        <p className="mt-1 text-sm text-gray-500">Set up your business in under a minute.</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <Field label="Business name">
            <Input required minLength={2} value={form.businessName} onChange={set('businessName')} placeholder="Zest Cafe" />
          </Field>
          <Field label="Your name">
            <Input required minLength={2} value={form.ownerName} onChange={set('ownerName')} placeholder="Raj Kumar" />
          </Field>
          <Field label="Email">
            <Input type="email" required value={form.email} onChange={set('email')} placeholder="you@business.com" />
          </Field>
          <Field label="Password" hint="Minimum 8 characters">
            <PasswordInput required minLength={8} value={form.password} onChange={set('password')} placeholder="••••••••" />
          </Field>
          <Field label="Plan">
            <Select value={form.plan} onChange={set('plan')}>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="enterprise">Enterprise</option>
            </Select>
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" disabled={busy} className="w-full justify-center">
            {busy ? 'Creating…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
