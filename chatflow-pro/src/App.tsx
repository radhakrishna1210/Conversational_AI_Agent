import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import AuthBridge from "./components/AuthBridge";
import AuthGuard from "./components/AuthGuard";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Login from "./pages/Login.tsx";
import Register from "./pages/Register.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import NotFound from "./pages/NotFound.tsx";
import DashboardLayout from "./components/dashboard/DashboardLayout.tsx";
import WHHome from "./pages/dashboard/WHHome.tsx";
import WHTemplates from "./pages/dashboard/WHTemplates.tsx";
import WHCreateTemplate from "./pages/dashboard/WHCreateTemplate.tsx";
import WHCampaigns from "./pages/dashboard/WHCampaigns.tsx";
import WHCreateCampaign from "./pages/dashboard/WHCreateCampaign.tsx";
import WHContacts from "./pages/dashboard/WHContacts.tsx";
import WHInbox from "./pages/dashboard/WHInbox.tsx";
import WHAutomation from "./pages/dashboard/WHAutomation.tsx";
import WHAnalytics from "./pages/dashboard/WHAnalytics.tsx";
import WHNumberSetup from "./pages/dashboard/WHNumberSetup.tsx";
import WHApiManagement from "./pages/dashboard/WHApiManagement.tsx";
import WHSettings from "./pages/dashboard/WHSettings.tsx";
import WHAdminPool from "./pages/dashboard/WHAdminPool.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthBridge />
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/dashboard"
            element={
              <AuthGuard>
                <DashboardLayout />
              </AuthGuard>
            }
          >
            <Route index element={<WHHome />} />
            <Route path="templates" element={<WHTemplates />} />
            <Route path="templates/create" element={<WHCreateTemplate />} />
            <Route path="campaigns" element={<WHCampaigns />} />
            <Route path="campaigns/create" element={<WHCreateCampaign />} />
            <Route path="contacts" element={<WHContacts />} />
            <Route path="inbox" element={<WHInbox />} />
            <Route path="automation" element={<WHAutomation />} />
            <Route path="analytics" element={<WHAnalytics />} />
            <Route path="number-setup" element={<WHNumberSetup />} />
            <Route path="api" element={<WHApiManagement />} />
            <Route path="settings" element={<WHSettings />} />
            <Route path="admin/pool" element={<WHAdminPool />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
