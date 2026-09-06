import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';
import DocsWorkflow from '../DocsWorkflow';
import DocsImage from '../DocsImage';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { Users, Database, UploadCloud, CheckCircle } from 'lucide-react';

export default function UserContacts() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Audience & Contacts</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Call Contacts & Contact Clusters</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Manage your outbound address book, import customer CSV lists, organize audiences into Contact Clusters, and maintain compliance with automatic opt-out handling.
      </p>

      {/* Workflow Diagram */}
      <DocsWorkflow
        title="Contact Ingestion & Normalization Pipeline"
        description="How customer records are parsed, deduplicated, and mapped into campaign-ready clusters."
        steps={[
          {
            badge: 'STEP 01',
            title: 'Upload CSV',
            description: 'Import spreadsheet with phone numbers, names, and custom attributes.',
            icon: <UploadCloud size={16} />
          },
          {
            badge: 'STEP 02',
            title: 'E.164 Normalization',
            description: 'Phone numbers are cleaned, validated, and normalized into international E.164 format.',
            icon: <Database size={16} />
          },
          {
            badge: 'STEP 03',
            title: 'Workspace Dedupe',
            description: 'Existing contacts are updated without creating duplicate person rows.',
            icon: <CheckCircle size={16} />
          },
          {
            badge: 'STEP 04',
            title: 'Cluster Assignment',
            description: 'Contacts are added to named Contact Clusters ready for targeted dialers.',
            icon: <Users size={16} />
          }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. Key Concepts: Contacts vs. Clusters</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        The <strong>Call Contacts</strong> hub (<code style={{ color: 'var(--teal-fg)' }}>/contacts</code>) is split into two complementary operational views:
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--cyan-fg)', fontWeight: 600, marginBottom: '8px' }}>
            <Users size={18} />
            <span>Contact Clusters (Lists)</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            A named audience segment (e.g. <em>"Q4 Real Estate Leads"</em>, <em>"Renewals - Mumbai"</em>). Bulk Call campaigns and Voice Broadcasts always dial clusters, so lists can be re-dialed repeatedly without re-uploading spreadsheets.
          </p>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--lime)', fontWeight: 600, marginBottom: '8px' }}>
            <Database size={18} />
            <span>All Contacts (Directory)</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            The global address book of all unique individuals in your workspace. Holds contact attributes, call history counts, last called timestamps, and global opt-out status.
          </p>
        </div>
      </div>

      <DocsImage
        src="/screenshots/Call_contacts.png"
        alt="Call Contacts Management Console"
        caption="Call Contacts interface: organize contact clusters, manage lead directories, and monitor audience health"
      />

      <DocsScreenshotPlaceholder
        title="Call Contacts Management Interface"
        description="Tabbed view between Contact Clusters and All Contacts, with aggregate metrics (Total, Active, Opted Out, Invalid) and search filters."
        routePath="/contacts"
        elements={[
          { label: 'View Tabs', value: 'Clusters | All Contacts', type: 'button' },
          { label: 'Cluster Summary', value: 'Total Contacts, Dialable Count, Source (CSV/Manual)', type: 'text' },
          { label: 'Import CSV', value: 'Upload new spreadsheet into cluster', type: 'button' },
          { label: 'New Cluster', value: 'Create empty named audience list', type: 'button' }
        ]}
      />

      {/* Contact Status Lifecycle */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2. Contact Statuses & Compliance</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Every contact has a definitive status that strictly controls dialability:
      </p>

      <div style={{ overflowX: 'auto', marginBottom: 28 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Badge Color</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Dialable?</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>System Behavior</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--lime)' }}>ACTIVE</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Green</td>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--lime)' }}>Yes</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Standard verified contact, queued for outbound calls.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--coral)' }}>OPTED_OUT</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Red</td>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--coral)' }}>No (Blocked)</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Expressed DND request during a call or unsubscribed. Skipped across all campaigns automatically.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--amber)' }}>INVALID</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Amber</td>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--coral)' }}>No (Blocked)</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Unparseable phone number or disconnected number detected during dialing.</td>
            </tr>
            <tr>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)' }}>ARCHIVED</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Gray</td>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--coral)' }}>No</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Soft-deleted contact retained for historical call log reporting.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3. Step-by-Step: Importing Contacts from CSV</h2>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>From the left sidebar, click <strong>Call Contacts</strong> (<code style={{ color: 'var(--teal-fg)' }}>/contacts</code>).</li>
        <li>Click <strong>Import CSV</strong> in the upper right.</li>
        <li>Select an existing Contact Cluster or type a new Cluster Name.</li>
        <li>Upload your CSV file. Ensure the file contains a column for phone numbers (e.g. <code>Phone</code>, <code>Mobile</code>, or <code>ContactNumber</code>).</li>
        <li>Review the auto-detected column mappings (Name, Phone Number, Email, Custom Variables).</li>
        <li>Select your default country code (e.g. <code>+91 - India</code>) for numbers uploaded without international prefix codes.</li>
        <li>Click <strong>Start Import</strong>. The system normalizes numbers to international E.164 standard, deduplicates against existing contacts, and links the records into your cluster.</li>
      </ol>

      <DocsCallout type="security" title="DNC & TRAI REGULATORY COMPLIANCE">
        Outbound calling to contacts in India must respect National Do Not Disturb (DND) registries. If a customer says <em>"Do not call me again"</em> during a phone conversation, Spandan automatically transitions their contact status to <code>OPTED_OUT</code>.
      </DocsCallout>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/phone-numbers" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Phone Numbers & Compliance
        </Link>
        <Link to="/docs/user/bulk-campaigns" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Bulk Call Campaigns →
        </Link>
      </div>
    </div>
  );
}
