/**
 * Route-level pages for the admin console.
 *
 * The console's sections were previously tabs inside one 1,500-line component.
 * They are now addressable routes, so an admin can deep-link or bookmark
 * "the user list" and the browser back button behaves. The tab bodies
 * themselves are unchanged and still live in AdminPanel.tsx — only navigation
 * moved, which keeps this change reviewable.
 */
import { Users, Phone, Bug, CreditCard, TrendingUp, Activity, CalendarDays } from 'lucide-react';
import {
  AdminPageHeader,
  UserManagementTab,
  NumberPoolTab,
  ReportIssuesTab,
  AppointmentsTab,
  PlansTab,
  WalletCreditTab,
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

export function AdminNumbersPage() {
  return (
    <>
      <AdminPageHeader
        title="Number Pool"
        subtitle="WABA numbers: assign, unassign, reset and deactivate"
        icon={<Phone size={21} />}
      />
      <NumberPoolTab />
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

export function AdminPlansPage() {
  return (
    <>
      <AdminPageHeader
        title="Plans & Pricing"
        subtitle="The live plan catalogue — edits apply to new subscriptions immediately"
        icon={<TrendingUp size={21} />}
      />
      <PlansTab />
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
