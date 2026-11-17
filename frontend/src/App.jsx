import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuth } from './lib/auth';
import Account from './pages/Account';
import Audit from './pages/Audit';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import Login from './pages/Login';
import Messages from './pages/Messages';
import Payroll from './pages/Payroll';
import Pos from './pages/Pos';
import Products from './pages/Products';
import Sales from './pages/Sales';
import Setup from './pages/Setup';
import Stock from './pages/Stock';
import Transfers from './pages/Transfers';
import Users from './pages/Users';

function Protected({ children }) {
  const { user, mustChange } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (mustChange) return <Navigate to="/change-password" replace />;
  return children;
}

function Role({ roles, children }) {
  const { user } = useAuth();
  return roles.includes(user.role) ? children : <Navigate to="/" replace />;
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={user.role === 'sales' ? '/pos' : '/dashboard'} replace />;
}

export default function App() {
  const { user } = useAuth();
  const staffUp = ['admin', 'staff'];
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/change-password" element={user ? <ChangePassword /> : <Navigate to="/login" replace />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Home />} />
        <Route path="dashboard" element={<Role roles={staffUp}><Dashboard /></Role>} />
        <Route path="pos" element={<Pos />} />
        <Route path="sales" element={<Sales />} />
        <Route path="stock" element={<Stock />} />
        <Route path="messages" element={<Messages />} />
        <Route path="payroll" element={<Role roles={['admin']}><Payroll /></Role>} />
        <Route path="transfers" element={<Role roles={staffUp}><Transfers /></Role>} />
        <Route path="products" element={<Role roles={['admin']}><Products /></Role>} />
        <Route path="expenses" element={<Role roles={staffUp}><Expenses /></Role>} />
        <Route path="users" element={<Role roles={['admin']}><Users /></Role>} />
        <Route path="setup" element={<Role roles={['admin']}><Setup /></Role>} />
        <Route path="audit" element={<Role roles={['admin']}><Audit /></Role>} />
        <Route path="account" element={<Account />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
