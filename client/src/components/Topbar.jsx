import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { IconLogout } from './icons.jsx';
import { Badge } from './ui.jsx';

const roleLabel = {
  PLATFORM_ADMIN: 'Platform Admin',
  MERCHANT_OWNER: 'Owner',
  MERCHANT_MANAGER: 'Manager',
  MERCHANT_STAFF: 'Staff',
};

export default function Topbar() {
  const { user, tenant, logout } = useAuth();
  const navigate = useNavigate();

  const initials = (user?.name || 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="text-sm text-gray-500">
        {tenant?.businessName ? (
          <span className="font-medium text-gray-800">{tenant.businessName}</span>
        ) : (
          <span className="font-medium text-gray-800">LoyaltyLedger</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Badge tone="brand">{roleLabel[user?.role] || user?.role}</Badge>
        <button
          onClick={() => navigate('/app/profile')}
          title="My profile"
          className="flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors hover:bg-gray-100"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white">
            {initials}
          </span>
          <div className="hidden text-left sm:block">
            <div className="text-sm font-medium leading-tight text-gray-800">{user?.name}</div>
            <div className="text-xs text-gray-400">{user?.email}</div>
          </div>
        </button>
        <button
          onClick={onLogout}
          title="Logout"
          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600"
        >
          <IconLogout size={19} />
        </button>
      </div>
    </header>
  );
}
