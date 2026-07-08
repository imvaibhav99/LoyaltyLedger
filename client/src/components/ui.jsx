import { useEffect } from 'react';
import { IconX, IconAlert } from './icons.jsx';

export const inr = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`;
export const num = (n) => Number(n ?? 0).toLocaleString('en-IN');
export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
    ghost: 'border border-gray-300 text-gray-700 hover:bg-gray-100 bg-white',
    danger: 'bg-white border border-red-300 text-red-600 hover:bg-red-50',
    dark: 'bg-navy-900 text-white hover:bg-navy-800',
  };
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

export function Input(props) {
  return <input className={inputCls} {...props} />;
}
export function Select({ children, ...props }) {
  return (
    <select className={inputCls} {...props}>
      {children}
    </select>
  );
}

export function Badge({ tone = 'gray', children }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-600',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    brand: 'bg-brand-50 text-brand-700',
    navy: 'bg-navy-900 text-white',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export const statusTone = (s) =>
  ({ active: 'green', ACTIVE: 'green', inactive: 'gray', INACTIVE: 'gray', suspended: 'red', cancelled: 'red', blocked: 'red', PENDING: 'amber' }[s] || 'gray');

export function Card({ className = '', children }) {
  return <div className={`rounded-xl border border-gray-200 bg-white ${className}`}>{children}</div>;
}

export function StatTile({ label, value, sub }) {
  return (
    <Card className="p-5">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-400">{sub}</div>}
    </Card>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ head, children, empty }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              {head.map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">{children}</tbody>
        </table>
        {empty}
      </div>
    </Card>
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm font-medium text-gray-600">{title}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      <IconAlert size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-gray-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
      {label}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/50 p-4 pt-16" onMouseDown={onClose}>
      <div
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-xl bg-white shadow-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <IconX size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
