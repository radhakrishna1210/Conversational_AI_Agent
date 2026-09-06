import { Link } from 'react-router-dom';
import DocsWorkflow from '../DocsWorkflow';
import DocsImage from '../DocsImage';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { CreditCard, Clock, FileText, ShieldCheck } from 'lucide-react';

export default function UserBilling() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Account & Billing</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Billing & Prepaid Wallet</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Understand the transparent per-minute prepaid wallet billing system, top up balances with Razorpay, inspect ledger transactions, and download tax invoices.
      </p>

      {/* Workflow Diagram */}
      <DocsWorkflow
        title="Wallet Top-Up & Call Settlement Flow"
        description="The financial lifecycle from gateway deposit to per-call usage settlement and ledger auditing."
        steps={[
          {
            badge: 'STEP 01',
            title: 'Top Up Wallet',
            description: 'Initiate deposit in INR via Razorpay (UPI, NetBanking, Cards).',
            icon: <CreditCard size={16} />
          },
          {
            badge: 'STEP 02',
            title: 'Instant Credit',
            description: 'Cryptographic webhook verifies payment and credits balance in minor units (paise).',
            icon: <ShieldCheck size={16} />
          },
          {
            badge: 'STEP 03',
            title: 'Per-Call Settlement',
            description: 'When a call finishes, connected talk-time is settled against the platform rate card.',
            icon: <Clock size={16} />
          },
          {
            badge: 'STEP 04',
            title: 'Ledger & Invoice',
            description: 'Append-only ledger records exact balance delta; tax invoice is generated.',
            icon: <FileText size={16} />
          }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. Transparent Per-Minute Commercial Model</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Spandan operates on a single, transparent prepaid commercial model denominated in <strong>Indian Rupees (INR)</strong>. There are no recurring monthly seat fees, confusing tiered allowances, or arbitrary feature lockouts.
      </p>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px', marginBottom: '24px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
          Key Billing Principles:
        </div>
        <ul style={{ paddingLeft: 20, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.8, fontSize: '13.5px' }}>
          <li><strong>Pay Strictly for Talk-Time:</strong> You are charged only for actual connected conversation seconds rounded up to the nearest billing unit.</li>
          <li><strong>Zero Cost for Unanswered Calls:</strong> Busy signals, unanswered rings, and carrier routing failures incur zero charges (₹0.00).</li>
          <li><strong>Shared Workspace Balance:</strong> All agents, voice broadcasts, and team members draw from a single pooled workspace wallet.</li>
        </ul>
      </div>

      <DocsImage
        src="/screenshots/Wallet.png"
        alt="Workspace Prepaid Wallet & Billing Console"
        caption="Prepaid wallet console: manage balances, review runway meter, top up via Razorpay, and view billing history"
      />

      <DocsScreenshotPlaceholder
        title="Billing & Wallet Command Center"
        description="Active wallet balance display in INR, Runway Meter estimating remaining talk-time minutes, Razorpay top-up button, and transaction history."
        routePath="/billing"
        elements={[
          { label: 'Current Balance', value: '₹14,250.00 (Denominated in INR)', type: 'badge' },
          { label: 'Runway Meter', value: '320 Minutes remaining (Estimated talk-time)', type: 'badge' },
          { label: 'Top Up Action', value: 'Opens Razorpay payment modal with presets', type: 'button' },
          { label: 'Platform Rate', value: 'Single flat rate per talk-time minute', type: 'text' }
        ]}
      />

      {/* Step-by-Step Top Up */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2. Step-by-Step: Topping Up Your Balance</h2>

      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>Navigate to <strong>Billing</strong> (<code style={{ color: 'var(--teal-fg)' }}>/billing</code>) from the left sidebar.</li>
        <li>Click <strong>Top Up Balance</strong>.</li>
        <li>Choose a preset top-up amount or enter a custom amount:
          <ul style={{ paddingLeft: '20px', marginTop: '6px' }}>
            <li>₹500 (50,000 paise)</li>
            <li>₹1,000 (100,000 paise)</li>
            <li>₹2,500 (250,000 paise)</li>
            <li>₹5,000 (500,000 paise)</li>
            <li>₹10,000 (1,000,000 paise)</li>
            <li>₹25,000 (2,500,000 paise)</li>
          </ul>
        </li>
        <li>Click <strong>Proceed to Payment</strong>. The Razorpay checkout modal opens.</li>
        <li>Complete payment using <strong>UPI</strong> (Google Pay, PhonePe, Paytm QR), <strong>Credit/Debit Card</strong>, or <strong>Corporate NetBanking</strong>.</li>
        <li>The balance updates immediately on your screen, and an append-only entry is recorded in the transaction ledger.</li>
      </ol>

      {/* Append-Only Ledger */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>3. Append-Only Transaction Ledger</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Every monetary movement is recorded in an immutable ledger (<code style={{ color: 'var(--teal-fg)' }}>WalletTransaction</code>). The balance can never drift from the audit trail:
      </p>

      <div style={{ overflowX: 'auto', marginBottom: 28 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Type</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Sign</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Trigger Event</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>Metadata & Audit Info</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--lime)' }}>topup</td>
              <td style={{ padding: '12px 16px', color: 'var(--lime)', fontWeight: 700 }}>+ Credit</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Successful Razorpay gateway payment.</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Carries Razorpay payment ID and order reference.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--coral)' }}>usage</td>
              <td style={{ padding: '12px 16px', color: 'var(--coral)', fontWeight: 700 }}>- Debit</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Completed conversational call or voice broadcast.</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Linked to exact <code>callLogId</code> and talk-time seconds.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--teal-fg)' }}>admin_credit</td>
              <td style={{ padding: '12px 16px', color: 'var(--lime)', fontWeight: 700 }}>+ Credit</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Promotional grant or trial balance from platform operator.</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Includes administrator note and audit trail entry.</td>
            </tr>
            <tr>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--violet)' }}>refund</td>
              <td style={{ padding: '12px 16px', color: 'var(--lime)', fontWeight: 700 }}>+ Credit</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Reversal of dropped or degraded carrier call.</td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>Reimbursement reference and reason code.</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/team" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Workspace & Team
        </Link>
        <Link to="/docs/user/api-keys" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          API Keys & Programmatic Access →
        </Link>
      </div>
    </div>
  );
}
