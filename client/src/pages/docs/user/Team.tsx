import { Link } from 'react-router-dom';
import DocsWorkflow from '../DocsWorkflow';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { UserPlus, Clock, Bell, Settings } from 'lucide-react';

export default function UserTeam() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Workspace & Settings</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Workspace & Team Settings</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Configure workspace profile details, manage team member invitations and role permissions, set operating business hours, and tune notification alerts.
      </p>

      {/* Workflow Diagram */}
      <DocsWorkflow
        title="Workspace Team & Security Management"
        description="How team collaboration, role permissions, and operational settings are managed within an isolated workspace."
        steps={[
          {
            badge: 'SETTINGS',
            title: 'Workspace Profile',
            description: 'Set company name, operating timezone, and primary contact information.',
            icon: <Settings size={16} />
          },
          {
            badge: 'MEMBERS',
            title: 'Invite Team',
            description: 'Send email invitations with defined role permissions (Admin or Member).',
            icon: <UserPlus size={16} />
          },
          {
            badge: 'OPERATIONS',
            title: 'Business Hours',
            description: 'Define allowed outbound dialing windows to prevent after-hours calls.',
            icon: <Clock size={16} />
          },
          {
            badge: 'ALERTS',
            title: 'Notification Triggers',
            description: 'Configure automated alerts for campaign completion, opt-outs, and low wallet balances.',
            icon: <Bell size={16} />
          }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. Workspace Roles & Permissions</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Spandan enforces strict role-based access control (RBAC) across workspace members:
      </p>

      <div style={{ overflowX: 'auto', marginBottom: 28 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Role</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Target User</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Permissions & Capabilities</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>Workspace Admin</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Operations Lead, Founder</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Full access: Top up wallet, invite/remove members, generate API keys, create and delete agents, buy numbers, and delete campaigns.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--cyan-fg)' }}>Workspace Member</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Agent Designer, Analyst</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Operational access: Create and edit agents, test calls, import contacts, launch campaigns, and review call logs. Cannot alter billing or revoke API keys.</td>
            </tr>
            <tr>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--violet)' }}>Platform Superadmin</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Infrastructure Operator</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Dedicated admin console (<code style={{ color: 'var(--teal-fg)' }}>/admin</code>): Platform wallet rates, model catalog management, user bans, and audit logs.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <DocsScreenshotPlaceholder
        title="Workspace Settings Console"
        description="Profile settings, password security, operating timezone configuration, email digests, and call notification switches."
        routePath="/settings"
        elements={[
          { label: 'Profile Form', value: 'Full Name, Work Email, Verified Phone', type: 'input' },
          { label: 'Timezone Picker', value: 'Kolkata (GMT+5:30) | New York (GMT-5) | London (GMT+0)', type: 'input' },
          { label: 'Preferences', value: 'Email Digest, Call Alerts, Low Balance Notification', type: 'badge' },
          { label: 'Security', value: 'Password Change with complexity enforcement', type: 'text' }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2. Inviting Team Members</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        To collaborate with colleagues on the same agent library and shared wallet balance:
      </p>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>Navigate to <strong>Settings</strong> (<code style={{ color: 'var(--teal-fg)' }}>/settings</code>).</li>
        <li>Under the <strong>Team Members</strong> section, click <strong>Invite Member</strong>.</li>
        <li>Enter the colleague's work email address and assign their role (<strong>Admin</strong> or <strong>Member</strong>).</li>
        <li>Click <strong>Send Invitation</strong>.</li>
        <li>The recipient receives a secure one-time invite token link. Once accepted, they gain instant access to your workspace.</li>
      </ol>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3. Notification Triggers & Alerts</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Configure which operational events generate notifications in the topbar notification bell and email inbox:
      </p>
      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li><strong>Campaign Completion:</strong> Alerts you immediately when a bulk calling campaign finishes dialing all recipients.</li>
        <li><strong>Customer Opt-Outs:</strong> Sends an alert whenever a contact requests Do Not Call during an AI conversation.</li>
        <li><strong>Low Wallet Balance:</strong> Notifies administrators when wallet runway drops below 20% of estimated monthly usage.</li>
        <li><strong>Rate Limit Alerts:</strong> Warnings if campaign dialing hits carrier concurrency thresholds.</li>
      </ul>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/integrations" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Integrations Ecosystem
        </Link>
        <Link to="/docs/user/billing" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Billing & Prepaid Wallet →
        </Link>
      </div>
    </div>
  );
}
