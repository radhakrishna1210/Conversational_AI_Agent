/**
 * Route-level pages for the admin console.
 *
 * The console's sections were previously tabs inside one 1,500-line component.
 * They are now addressable routes, so an admin can deep-link or bookmark
 * "the user list" and the browser back button behaves. The tab bodies
 * themselves are unchanged and still live in AdminPanel.tsx — only navigation
 * moved, which keeps this change reviewable.
 */
import { Users, Bug, CreditCard, TrendingUp, Activity, CalendarDays, Cpu, Mail } from 'lucide-react';
import {
  AdminPageHeader,
  UserManagementTab,
  ReportIssuesTab,
  ContactRequestsTab,
  AppointmentsTab,
  WalletRateTab,
  WalletCreditTab,
  ModelAccessTab,
  SystemHealthTab,
} from './AdminPanel';

export function AdminUsersPage() {
  return (
    <>
      <AdminPageHeader
        title="Users"
        subtitle="Search, inspect, suspend and re-plan any account on the platform"
        icon={<Users size={21} />}
      />
      <UserManagementTab />
    </>
  );
}

export function AdminIssuesPage() {
  return (
    <>
      <AdminPageHeader
        title="Reported Issues"
        subtitle="Issues submitted from the in-product report form"
        icon={<Bug size={21} />}
      />
      <ReportIssuesTab />
    </>
  );
}

export function AdminAppointmentsPage() {
  return (
    <>
      <AdminPageHeader
        title="Appointments"
        subtitle="Demo and onboarding bookings from the public site"
        icon={<CalendarDays size={21} />}
      />
      <AppointmentsTab />
    </>
  );
}

export function AdminContactRequestsPage() {
  return (
    <>
      <AdminPageHeader
        title="Contact Requests"
        subtitle="Sales enquiries from the Connect with our sales team form"
        icon={<Mail size={21} />}
      />
      <ContactRequestsTab />
    </>
  );
}

export function AdminPlansPage() {
  return (
    <>
      <AdminPageHeader
        title="Wallet Rate"
        subtitle="The rupees-per-minute every call is charged — the only pricing this platform has"
        icon={<TrendingUp size={21} />}
      />
      <WalletRateTab />
    </>
  );
}

export function AdminWalletsPage() {
  return (
    <>
      <AdminPageHeader
        title="Wallet Credits"
        subtitle="Manual balance adjustments. Every change is recorded in the audit log."
        icon={<CreditCard size={21} />}
      />
      <WalletCreditTab />
    </>
  );
}

export function AdminModelsPage() {
  return (
    <>
      <AdminPageHeader
        title="Models"
        subtitle="Which models clients can see and use — conversational engines, LLMs, transcription and voices"
        icon={<Cpu size={21} />}
      />
      <ModelAccessTab />
    </>
  );
}

export function AdminHealthPage() {
  return (
    <>
      <AdminPageHeader
        title="System Health"
        subtitle="Database, cache and provider configuration status"
        icon={<Activity size={21} />}
      />
      <SystemHealthTab />
    </>
  );
}
