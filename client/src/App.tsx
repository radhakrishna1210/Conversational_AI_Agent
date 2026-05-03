import { BrowserRouter as Router, Routes, Route, useLocation, Outlet, Navigate } from 'react-router-dom';
import { useEffect } from 'react';

// Layout Components
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import DashboardLayout from './components/DashboardLayout';
import AnnouncementBar from './components/AnnouncementBar';

// Pages
import Home from './pages/Home';
import Pricing from './pages/Pricing';
import Documentation from './pages/Documentation';
import BookAppointment from './pages/BookAppointment';
import Contact from './pages/Contact';
import Docs from './pages/Docs';
import ReportIssue from './pages/ReportIssue';
import Dashboard from './pages/Dashboard';
import BulkCall from './pages/BulkCall';
import CloneVoice from './pages/CloneVoice';
import Files from './pages/Files';
import Integrations from './pages/Integrations';
import PhoneNumbers from './pages/PhoneNumbers';
import CallLogs from './pages/CallLogs';
import Analytics from './pages/Analytics';
import WhatsApp from './pages/WhatsApp';
import Billing from './pages/Billing';
import ApiKeys from './pages/ApiKeys';
import Settings from './pages/Settings';
import SignUp from './pages/SignUp';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import EditAgent from './pages/EditAgent';


function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function DefaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>{children}</div>
      </div>
      <Footer />
    </>
  );
}

function ProtectedRoute() {
  // Check if user just logged out
  if (sessionStorage.getItem('loggedOut')) {
    sessionStorage.removeItem('loggedOut');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('workspaceId');
  }

  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;

  // Also check JWT expiry
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('workspaceId');
      return <Navigate to="/login" replace />;
    }
  } catch {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function DashboardLayoutWrapper() {
  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}

function App() {
  return (
    <Router>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<DefaultLayout><Home /></DefaultLayout>} />
        <Route path="/pricing" element={<DefaultLayout><Pricing /></DefaultLayout>} />
        <Route path="/documentation" element={<DefaultLayout><Documentation /></DefaultLayout>} />
        <Route path="/book-appointment" element={<DefaultLayout><BookAppointment /></DefaultLayout>} />
        <Route path="/contact" element={<DefaultLayout><Contact /></DefaultLayout>} />
        <Route path="/docs" element={<DefaultLayout><Docs /></DefaultLayout>} />
        <Route path="/report-issue" element={<DefaultLayout><ReportIssue /></DefaultLayout>} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/agent/:agentId" element={<EditAgent />} />
        {/* Protected dashboard routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayoutWrapper />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/bulk_call" element={<BulkCall />} />
            <Route path="/clone_voice" element={<CloneVoice />} />
            <Route path="/files" element={<Files />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/phone_numbers" element={<PhoneNumbers />} />
            <Route path="/call_logs" element={<CallLogs />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/whatsapp" element={<WhatsApp />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/api_keys" element={<ApiKeys />} />
            <Route path="/agent/:agentId" element={<EditAgent />} />

            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
