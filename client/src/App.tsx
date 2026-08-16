import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { isLoggedIn, isAdminRole, isCustomerSession } from '@/lib/authStorage';
import ForgotPassword from './pages/ForgotPassword';
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
import Finance from './pages/Finance';
import Education from './pages/Education';
import Ecommerce from './pages/Ecommerce';
import LeadGeneration from './pages/LeadGeneration';
import CalCom from './pages/CalCom';
import SalesforcePage from './pages/Salesforce';
import CustomApi from './pages/CustomApi';
import Dashboard from './pages/Dashboard';
import BulkCall from './pages/BulkCall';
import BroadcastPage from './pages/Broadcast';
import Contacts from './pages/Contacts';
import Vonage from "./pages/SIPTrunking";
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
import VoiceAssistant from './components/VoiceAssistant';
import AdminPanel from './pages/AdminPanel';
import AdminLayout from './components/AdminLayout';
import AdminAuditLog from './pages/AdminAuditLog';
import AdminCallLogs from './pages/AdminCallLogs';
import AdminBilling from './pages/AdminBilling';
import {
  AdminUsersPage, AdminIssuesPage, AdminAppointmentsPage,
  AdminPlansPage, AdminWalletsPage, AdminModelsPage, AdminHealthPage,
} from './pages/adminPages';
import NotificationArchive from './pages/NotificationArchive';
import AirtelVerifiedCalling from './pages/AirtelVerifiedCalling';

import SolutionUseCasePage from './pages/solutions/SolutionUseCasePage';
import { solutionUseCases } from './pages/solutions/useCaseContent';

import { Toaster } from './components/ui/sonner';
import { ThemeProvider } from './hooks/useTheme';



import RealEstate from "./pages/RealEstate";
import Insurance from "./pages/Insurance";
import Healthcare from "./pages/Healthcare";
import Restaurants from "./pages/Restaurants";
// Quick Wrapper for the new page
function VoiceAssistantPage() {
  return (
    <div className="container py-8">
      <VoiceAssistant />
    </div>
  );
}

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

/**
 * Layout for the public pages that are also reachable from inside the customer
 * app (Docs, Report Issue).
 *
 * A signed-in customer reaches these from the dashboard sidebar, so they keep
 * the dashboard shell rather than watching their sidebar be replaced by the
 * marketing Navbar/Footer mid-session. Signed-out visitors still get the public
 * layout — these URLs stay linkable from the marketing site.
 *
 * A Superadmin also gets the public layout: the customer sidebar is not their
 * navigation, for the same reason CustomerRoute keeps them out of /dashboard.
 */
function AdaptiveLayout({ children }: { children: React.ReactNode }) {
  if (isCustomerSession()) {
    return <DashboardLayout>{children}</DashboardLayout>;
  }
  return <DefaultLayout>{children}</DefaultLayout>;
}

function ProtectedRoute() {
  // sessionStorage-aware (Safari/incognito login falls back to sessionStorage)
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

/**
 * Customer-app boundary.
 *
 * A Superadmin is the platform operator, not a tenant, so the customer
 * dashboard is not their home — they are sent to the console instead. This is
 * what makes "/admin only" true no matter how the user arrives: a bookmark to
 * /dashboard, a stale tab, or the post-login redirect all land in the console.
 *
 * Tenant data is still reachable deliberately, through the admin console's own
 * views, rather than by the operator wandering into a customer screen.
 */
function CustomerRoute() {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (isAdminRole()) return <Navigate to="/admin" replace />;
  return <Outlet />;
}

/**
 * Client-side admin boundary. Non-admin users are redirected to the dashboard
 * instead of ever mounting the AdminPanel. (The server independently enforces
 * authenticate + isAdmin on every /admin API route — this guard is UX, the
 * API is the real security boundary.)
 */
function AdminRoute() {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (!isAdminRole()) return <Navigate to="/dashboard" replace />;
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
    <ThemeProvider>
      <Router>
        <ScrollToTop />
      <Toaster position="top-right" richColors />
      <Routes>
        <Route path="/" element={<DefaultLayout><Home /></DefaultLayout>} />
        <Route path="/pricing" element={<DefaultLayout><Pricing /></DefaultLayout>} />
        <Route path="/documentation" element={<DefaultLayout><Documentation /></DefaultLayout>} />
        <Route path="/book-appointment" element={<DefaultLayout><BookAppointment /></DefaultLayout>} />
        <Route path="/contact" element={<DefaultLayout><Contact /></DefaultLayout>} />
        <Route path="/docs" element={<AdaptiveLayout><Docs /></AdaptiveLayout>} />
        <Route path="/report-issue" element={<AdaptiveLayout><ReportIssue /></AdaptiveLayout>} />
        {/* Public: Airtel verified-calling guide, linked from the caller-number picker */}
        <Route path="/airtel-verified-calling" element={<AirtelVerifiedCalling />} />
        <Route path="/solutions/verticals/finance" element={<Finance />} />
        <Route path="/solutions/verticals/education" element={<Education />} />
        <Route path="/solutions/verticals/ecommerce" element={<Ecommerce />} />
        <Route path="/solutions/use-cases/lead-generation" element={<LeadGeneration />} />
        <Route path="/integrations/cal-com" element={<DefaultLayout><CalCom /></DefaultLayout>} />
        <Route path="/integrations/salesforce" element={<DefaultLayout><SalesforcePage /></DefaultLayout>} />
        <Route path="/integrations/custom-api" element={<DefaultLayout><CustomApi /></DefaultLayout>} />
        <Route path="/integrations/SIPTrunking" element={<DefaultLayout><Vonage /></DefaultLayout>} />
        {/* Solution Use Cases */}
<Route
  path="/solutions/use-cases/collections"
  element={
    <DefaultLayout>
      <SolutionUseCasePage content={solutionUseCases.collections} />
    </DefaultLayout>
  }
/>

<Route
  path="/solutions/use-cases/negotiation"
  element={
    <DefaultLayout>
      <SolutionUseCasePage content={solutionUseCases.negotiation} />
    </DefaultLayout>
  }
/>

<Route
  path="/solutions/use-cases/customer-support"
  element={
    <DefaultLayout>
      <SolutionUseCasePage content={solutionUseCases.customerSupport} />
    </DefaultLayout>
  }
/>

<Route
  path="/solutions/use-cases/appointments"
  element={
    <DefaultLayout>
      <SolutionUseCasePage content={solutionUseCases.appointments} />
    </DefaultLayout>
  }
/>

<Route path="/signup" element={<SignUp />} />
        
        <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* Protected dashboard routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<CustomerRoute />}>
          <Route element={<DashboardLayoutWrapper />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/bulk_call" element={<BulkCall />} />
            <Route path="/broadcast" element={<BroadcastPage />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/notifications/archive" element={<NotificationArchive />} />
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
            <Route path="/voice_assistant" element={<VoiceAssistantPage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Settings />} />
          </Route>
          </Route>
          {/*
            The admin console has its own shell (AdminLayout), NOT the customer
            DashboardLayout. It is a different product for a different person;
            nesting it in the tenant sidebar made platform administration look
            like one more customer feature and left the owner one click from
            falling back into a tenant view.
          */}
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminPanel />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="appointments" element={<AdminAppointmentsPage />} />
              <Route path="billing" element={<AdminBilling />} />
              <Route path="plans" element={<AdminPlansPage />} />
              <Route path="wallets" element={<AdminWalletsPage />} />
              <Route path="calls" element={<AdminCallLogs />} />
              <Route path="issues" element={<AdminIssuesPage />} />
              <Route path="models" element={<AdminModelsPage />} />
              <Route path="audit" element={<AdminAuditLog />} />
              <Route path="health" element={<AdminHealthPage />} />
              {/* Unknown admin path lands on the overview rather than a blank frame. */}
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>
          </Route>
        </Route>
       <Route
  path="/solutions/verticals/real-estate"
  element={
    <DefaultLayout>
      <RealEstate />
    </DefaultLayout>
  }
/>

<Route
  path="/solutions/verticals/insurance"
  element={
    <DefaultLayout>
      <Insurance />
    </DefaultLayout>
  }
/>

<Route
  path="/solutions/verticals/healthcare"
  element={
    <DefaultLayout>
      <Healthcare />
    </DefaultLayout>
  }
/>

<Route
  path="/solutions/verticals/restaurants"
  element={
    <DefaultLayout>
      <Restaurants />
    </DefaultLayout>
  }
/>
      </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;


