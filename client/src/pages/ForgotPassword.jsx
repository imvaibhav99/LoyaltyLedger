import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { apiMessage } from '../api/axios.js';
import { Button, Field, Input, PasswordInput, ErrorNote } from '../components/ui.jsx';
import { IconCheck } from '../components/icons.jsx';
import { AuthShell } from './Login.jsx';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState('email'); // email → code → password → done
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/auth/forgot-password', { email });
      setStep('code');
    });
  };

  const verifyCode = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/auth/verify-reset-code', { email, code });
      setStep('password');
    });
  };

  const resetPassword = (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    run(async () => {
      await api.post('/auth/reset-password', { email, code, newPassword: password });
      setStep('done');
    });
  };

  const resend = () => {
    setCode('');
    run(async () => {
      await api.post('/auth/forgot-password', { email });
    });
  };

  return (
    <AuthShell>
      <div className="w-full max-w-sm">
        {step === 'email' && (
          <>
            <h2 className="text-2xl font-semibold text-gray-900">Forgot password?</h2>
            <p className="mt-1 text-sm text-gray-500">
              Enter your account email and we&apos;ll send you a 4-digit reset code.
            </p>
            <form onSubmit={sendCode} className="mt-8 space-y-4">
              <Field label="Email">
                <Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
              </Field>
              <ErrorNote>{error}</ErrorNote>
              <Button type="submit" disabled={busy} className="w-full justify-center">
                {busy ? 'Sending…' : 'Send code'}
              </Button>
            </form>
          </>
        )}

        {step === 'code' && (
          <>
            <h2 className="text-2xl font-semibold text-gray-900">Check your email</h2>
            <p className="mt-1 text-sm text-gray-500">
              We sent a 4-digit code to <span className="font-medium text-gray-700">{email}</span>. It expires in 10 minutes.
            </p>
            <form onSubmit={verifyCode} className="mt-8 space-y-4">
              <Field label="Reset code">
                <Input
                  required
                  autoFocus
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="0000"
                  className="tracking-[0.5em] text-center text-lg font-semibold"
                />
              </Field>
              <ErrorNote>{error}</ErrorNote>
              <Button type="submit" disabled={busy || code.length !== 4} className="w-full justify-center">
                {busy ? 'Verifying…' : 'Verify code'}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-gray-500">
              Didn&apos;t get it?{' '}
              <button type="button" onClick={resend} disabled={busy} className="font-medium text-brand-600 hover:underline">
                Resend code
              </button>
            </p>
          </>
        )}

        {step === 'password' && (
          <>
            <h2 className="text-2xl font-semibold text-gray-900">Set a new password</h2>
            <p className="mt-1 text-sm text-gray-500">Choose a new password for your account.</p>
            <form onSubmit={resetPassword} className="mt-8 space-y-4">
              <Field label="New password" hint="At least 8 characters">
                <PasswordInput required autoFocus minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </Field>
              <Field label="Confirm new password">
                <PasswordInput required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
              </Field>
              <ErrorNote>{error}</ErrorNote>
              <Button type="submit" disabled={busy} className="w-full justify-center">
                {busy ? 'Saving…' : 'Reset password'}
              </Button>
            </form>
          </>
        )}

        {step === 'done' && (
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <IconCheck size={24} />
            </span>
            <h2 className="mt-4 text-2xl font-semibold text-gray-900">Password reset</h2>
            <p className="mt-1 text-sm text-gray-500">
              Your password has been changed. Log in with your new password to continue.
            </p>
            <Button onClick={() => navigate('/login')} className="mt-8 w-full justify-center">
              Go to login
            </Button>
          </div>
        )}

        {step !== 'done' && (
          <p className="mt-6 text-center text-sm text-gray-500">
            Remembered it?{' '}
            <Link to="/login" className="font-medium text-brand-600 hover:underline">
              Back to login
            </Link>
          </p>
        )}
      </div>
    </AuthShell>
  );
}
