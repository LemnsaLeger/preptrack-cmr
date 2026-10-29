import Dashboard from './pages/Dashboard.jsx';
import useAuth from './hooks/useAuth.js';
import useDeadlines from './hooks/useDeadlines.js';

export default function App() {
  const auth = useAuth();
  // Until the stored session is read, treat the user as a guest so the dashboard opens instantly (offline too).
  const store = useDeadlines(auth.user?.id ?? null);
  return <Dashboard auth={auth} store={store} />;
}
