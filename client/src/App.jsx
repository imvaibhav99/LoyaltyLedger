import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth, homeFor, ROLES } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import RoleRoute from './components/RoleRoute.jsx';
import AppLayout from './components/AppLayout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Members from './pages/Members.jsx';
import MemberDetail from './pages/MemberDetail.jsx';
import POS from './pages/POS.jsx';
import Tiers from './pages/Tiers.jsx';
import Program from './pages/Program.jsx';
import Stores from './pages/Stores.jsx';
import Team from './pages/Team.jsx';
import Roles from './pages/Roles.jsx';
import Platform from './pages/Platform.jsx';
import Profile from './pages/Profile.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

const { PLATFORM_ADMIN, MERCHANT_OWNER, MERCHANT_MANAGER, MERCHANT_STAFF } = ROLES;
const MERCHANT_ALL = [MERCHANT_OWNER, MERCHANT_MANAGER, MERCHANT_STAFF];

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Home />} />
              <Route path="dashboard" element={<RoleRoute roles={[MERCHANT_OWNER, MERCHANT_MANAGER]}><Dashboard /></RoleRoute>} />
              <Route path="pos" element={<RoleRoute roles={MERCHANT_ALL}><POS /></RoleRoute>} />
              <Route path="members" element={<RoleRoute roles={MERCHANT_ALL}><Members /></RoleRoute>} />
              <Route path="members/:id" element={<RoleRoute roles={MERCHANT_ALL}><MemberDetail /></RoleRoute>} />
              <Route path="tiers" element={<RoleRoute roles={[MERCHANT_OWNER, MERCHANT_MANAGER]}><Tiers /></RoleRoute>} />
              <Route path="program" element={<RoleRoute roles={[MERCHANT_OWNER, MERCHANT_MANAGER]}><Program /></RoleRoute>} />
              <Route path="stores" element={<RoleRoute roles={[MERCHANT_OWNER, MERCHANT_MANAGER]}><Stores /></RoleRoute>} />
              <Route path="team" element={<RoleRoute roles={[MERCHANT_OWNER]}><Team /></RoleRoute>} />
              <Route path="roles" element={<RoleRoute roles={[MERCHANT_OWNER]}><Roles /></RoleRoute>} />
              <Route path="platform" element={<RoleRoute roles={[PLATFORM_ADMIN]}><Platform /></RoleRoute>} />
              <Route path="profile" element={<Profile />} />
            </Route>

            <Route path="*" element={<Home />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
