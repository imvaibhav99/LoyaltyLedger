import { NavLink } from 'react-router-dom';
import { useAuth, ROLES } from '../context/AuthContext.jsx';
import {
  IconDashboard, IconPOS, IconMembers, IconTiers, IconRules,
  IconStore, IconTeam, IconShield, IconGlobe, IconCoin,
} from './icons.jsx';

const OWNER = ROLES.MERCHANT_OWNER;
const MANAGER = ROLES.MERCHANT_MANAGER;
const STAFF = ROLES.MERCHANT_STAFF;
const ADMIN = ROLES.PLATFORM_ADMIN;

const NAV = [
  {
    section: 'Main',
    items: [
      { to: '/app/dashboard', label: 'Dashboard', icon: IconDashboard, roles: [OWNER, MANAGER] },
      { to: '/app/pos', label: 'POS Counter', icon: IconPOS, roles: [OWNER, MANAGER, STAFF] },
      { to: '/app/members', label: 'Members', icon: IconMembers, roles: [OWNER, MANAGER, STAFF] },
    ],
  },
  {
    section: 'Program',
    items: [
      { to: '/app/tiers', label: 'Tiers', icon: IconTiers, roles: [OWNER, MANAGER] },
      { to: '/app/program', label: 'Earn Rules', icon: IconRules, roles: [OWNER, MANAGER] },
      { to: '/app/stores', label: 'Stores', icon: IconStore, roles: [OWNER, MANAGER] },
    ],
  },
  {
    section: 'Manage',
    items: [
      { to: '/app/team', label: 'Team', icon: IconTeam, roles: [OWNER] },
      { to: '/app/roles', label: 'Roles', icon: IconShield, roles: [OWNER] },
    ],
  },
  {
    section: 'Platform',
    items: [{ to: '/app/platform', label: 'Tenants', icon: IconGlobe, roles: [ADMIN] }],
  },
];

export default function Sidebar() {
  const { user } = useAuth();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-navy-900 text-gray-300">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <IconCoin size={20} />
        </span>
        <div>
          <div className="text-[15px] font-semibold leading-tight text-white">LoyaltyLedger</div>
          <div className="text-[11px] text-gray-400">Points that bring them back</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        {NAV.map(({ section, items }) => {
          const visible = items.filter((i) => i.roles.includes(user?.role));
          if (!visible.length) return null;
          return (
            <div key={section} className="mt-4">
              <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                {section}
              </div>
              {visible.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `group mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      isActive
                        ? 'bg-navy-700 font-medium text-white shadow-[inset_3px_0_0_0] shadow-brand-500'
                        : 'hover:bg-navy-800 hover:text-white'
                    }`
                  }
                >
                  <Icon size={18} className="shrink-0" />
                  {label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
