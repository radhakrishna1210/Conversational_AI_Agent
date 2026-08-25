/**
 * Route-level pages for the admin console.
 *
 * The console's sections were previously tabs inside one 1,500-line component.
 * They are now addressable routes, so an admin can deep-link or bookmark
 * "the user list" and the browser back button behaves. The tab bodies
 * themselves are unchanged and still live in AdminPanel.tsx — only navigation
 * moved, which keeps this change reviewable.
 */
import { useState } from 'react';
import PricingBucketsTab from './PricingBucketsTab';
import { Users, Bug, CreditCard, TrendingUp, Activity, CalendarDays, Cpu, Mail } from 'lucide-react';
import {
  AdminPageHeader,
  UserManagementTab,
  ReportIssuesTab,
  ContactRequestsTab,
  AppointmentsTab,
  WalletRateTab,
  NumberRateTab,
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

/**
 * Every price on the platform, in the order they beat each other: the default
 * rate first, then the volume tiers and per-client overrides that take
 * precedence over it. These were two separate pages, which meant an admin had
 * to leave one to see what the other fell back to.
 */
export function AdminPricingPage() {
  // Held here so saving the default rate immediately corrects the "Default"
  // figure the tier table quotes, without either half refetching the other.
  const [defaultRate, setDefaultRate] = useState<number | null>(null);


  return (
    <>
      <AdminPageHeader
        title="Pricing"
        subtitle="The default rate, volume tiers, per-client rates, and phone-number pricing. Admin-only — nothing here is shown to clients."
        icon={<TrendingUp size={21} />}
      />

      <section style={{ marginBottom: 34 }}>
        <h2 style={sectionTitle}>Default rate</h2>
        <WalletRateTab onSaved={setDefaultRate} />
      </section>

      <section style={{ marginBottom: 34 }}>
        <h2 style={sectionTitle}>Volume tiers &amp; client rates</h2>
        <PricingBucketsTab defaultRate={defaultRate} />
      </section>

      {/*
        Numbers are the only thing besides talk time that costs a client money,
        and they bill on a different clock. Same page because an admin setting
        one price wants to see the other; separate card because changing them
        has different consequences — the per-minute rate applies to every call
        immediately, number pricing only to numbers rented afterwards.
      */}
      <section>
        <h2 style={sectionTitle}>Phone-number pricing</h2>
        <NumberRateTab />
      </section>
    </>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: 'var(--tx)',
  margin: '0 0 12px', paddingBottom: 10, borderBottom: '1px solid var(--line)',
};

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
