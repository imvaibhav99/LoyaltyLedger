import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from '../context/AuthContext.jsx';
import { apiMessage } from '../api/axios.js';
import { Button, Field, Input, ErrorNote } from '../components/ui.jsx';
import { IconCoin, IconCheck } from '../components/icons.jsx';

export function AuthShell({ children }) {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-[44%] flex-col justify-between bg-navy-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600">
            <IconCoin size={22} />
          </span>
          <span className="text-lg font-semibold">LoyaltyLedger</span>
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-snug">
            The loyalty engine for<br />your business.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-gray-400">
            Run a points program across all your stores — earn on every bill,
            redeem at the counter, and watch customers come back.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-gray-300">
            {['Points on every purchase, rules you control', 'Tiers that upgrade automatically', 'POS counter built for speed', 'Staff accounts with granular permissions'].map((f) => (
              <li key={f} className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <IconCheck size={12} />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-gray-500">© {new Date().getFullYear()} LoyaltyLedger</p>
      </div>
      <div className="flex flex-1 items-center justify-center bg-gray-50 p-6">{children}</div>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      navigate(homeFor(user.role), { replace: true });
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-semibold text-gray-900">Welcome back</h2>
        <p className="mt-1 text-sm text-gray-500">Log in to your loyalty dashboard.</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
          </Field>
          <Field label="Password">
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" disabled={busy} className="w-full justify-center">
            {busy ? 'Logging in…' : 'Log in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          New business?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:underline">
            Create your loyalty program
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
