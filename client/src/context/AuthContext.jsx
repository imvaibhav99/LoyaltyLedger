import { createContext, useContext, useState } from 'react';
import api from '../api/axios.js';

const AuthContext = createContext(null);

export const ROLES = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  MERCHANT_OWNER: 'MERCHANT_OWNER',
  MERCHANT_MANAGER: 'MERCHANT_MANAGER',
  MERCHANT_STAFF: 'MERCHANT_STAFF',
};

export const homeFor = (role) => {
  if (role === ROLES.PLATFORM_ADMIN) return '/app/platform';
  if (role === ROLES.MERCHANT_STAFF) return '/app/pos';
  return '/app/dashboard';
};

const readUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readUser);

  const saveSession = ({ user: u, accessToken, refreshToken, tenant }) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    if (tenant) localStorage.setItem('tenant', JSON.stringify(tenant));
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
    return u;
  };

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    return saveSession(data.data);
  };

  const register = async (payload) => {
    const { data } = await api.post('/auth/signup', payload);
    return saveSession(data.data);
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      await api.post('/auth/logout', { refreshToken }).catch(() => {});
    }
    localStorage.clear();
    setUser(null);
  };

  const tenant = (() => {
    try {
      return JSON.parse(localStorage.getItem('tenant'));
    } catch {
      return null;
    }
  })();

  return (
    <AuthContext.Provider value={{ user, tenant, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
