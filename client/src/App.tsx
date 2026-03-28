import { BrowserRouter as Router, Routes, Route, useLocation, Outlet } from 'react-router-dom';
import { useEffect } from 'react';

// Layout Components
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import DashboardLayout from './components/DashboardLayout';

// Pages
import Home from './pages/Home';
import Pricing from './pages/Pricing';
import Documentation from './pages/Documentation';
import BookAppointment from './pages/BookAppointment';
import Contact from './pages/Contact';
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
import WH from './pages/WH';
import SignUp from './pages/SignUp';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';

// WH Sub-pages
import WHHome from './pages/wh/WHHome';
import WHNumberSetup from './pages/wh/WHNumberSetup';
import WHApiManagement from './pages/wh/WHApiManagement';
import WHTemplates from './pages/wh/WHTemplates';
import WHCampaigns from './pages/wh/WHCampaigns';
import WHInbox from './pages/wh/WHInbox';
import WHAutomation from './pages/wh/WHAutomation';
import WHAnalytics from './pages/wh/WHAnalytics';
import WHSettings from './pages/wh/WHSettings';

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
      <Navbar />
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>{children}</div>
      </div>
      <Footer />
    </>
  );
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
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* Dashboard layouts without Navbar/Footer */}
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
          <Route path="/settings" element={<Settings />} />
          <Route path="/wh" element={<WH />}>
            <Route index element={<WHHome />} />
            <Route path="number-setup" element={<WHNumberSetup />} />
            <Route path="api" element={<WHApiManagement />} />
            <Route path="templates" element={<WHTemplates />} />
            <Route path="campaigns" element={<WHCampaigns />} />
            <Route path="inbox" element={<WHInbox />} />
            <Route path="automation" element={<WHAutomation />} />
            <Route path="analytics" element={<WHAnalytics />} />
            <Route path="settings" element={<WHSettings />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
