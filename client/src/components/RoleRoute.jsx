import { Navigate } from 'react-router-dom';
import { useAuth, homeFor } from '../context/AuthContext.jsx';

export default function RoleRoute({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}
