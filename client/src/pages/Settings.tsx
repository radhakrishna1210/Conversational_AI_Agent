import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '../hooks/useTheme';
import { safeGet } from '@/lib/authStorage';
import { RzCard, RzSwitch } from '@/components/rz';

/**
 * Settings — the two-column account panel from Spandan Account.dc.html#settings.
 *
 * Profile on the left, preferences and the danger zone stacked on the right.
 *
 * Only what the server can actually store is editable here. The profile,
 * password, timezone and the two notification toggles used to accept input and
 * toast "saved" while nothing left the browser (there is no endpoint for any of
 * them), so a user who "changed their password" still had the old one. Each is
 * now shown read-only with the working route to what they wanted, until the
 * endpoints exist.
 */

const muted = { fontSize: 12, color: 'var(--tx-3)', marginTop: 2 } as const;

export default function Settings() {
  const [user, setUser] = useState({ name: '', email: '' });
  const { darkMode, toggleDarkMode } = useTheme();

  useEffect(() => {
    // DashboardLayout refreshes these from /auth/me on mount.
    setUser({ name: safeGet('userName'), email: safeGet('userEmail') });
  }, []);

  const initials = (user.name || 'U')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="rz-page rz-page-pad rz-bleed">
      <div className="rz-wrap" style={{ maxWidth: 960 }}>
        <div className="rz-head">
          <div>
            <div className="rz-eyebrow">Account</div>
            <h1 className="rz-h1">Settings</h1>
            <p className="rz-sub" style={{ margin: '8px 0 0' }}>
              Your profile, sign-in security and how the console behaves.
            </p>
          </div>
        </div>

        <div className="rz-grid-2" style={{ gap: 16, alignItems: 'start' }}>
          {/* ── Left: profile + security ── */}
          <div className="rz-stack" style={{ gap: 16 }}>
            <RzCard title="Profile" size="lg">
              <div className="rz-cluster" style={{ gap: 14, marginBottom: 18 }}>
                <span className="rz-avatar" style={{ width: 52, height: 52, fontSize: 18 }}>{initials}</span>
                <div>
                  <div className="rz-title" style={{ fontSize: 14 }}>{user.name || 'Your account'}</div>
                  <div className="rz-mono-xs">{user.email || 'no email on file'}</div>
                </div>
              </div>

              <div className="rz-stack" style={{ gap: 14 }}>
                <div className="rz-field">
                  <label className="rz-field-label" htmlFor="set-name">Name</label>
                  <input id="set-name" className="rz-input" type="text" value={user.name} readOnly disabled />
                </div>
                <div className="rz-field">
                  <label className="rz-field-label" htmlFor="set-email">Email</label>
                  <input id="set-email" className="rz-input" type="email" value={user.email} readOnly disabled />
                </div>
                <div className="rz-field-hint">
                  Your name and sign-in email can't be edited here yet. Contact support to change them.
                </div>
              </div>
            </RzCard>

            <RzCard title="Security" size="lg">
              <p className="rz-sub" style={{ margin: '-6px 0 16px' }}>
                To change your password, reset it: we email a one-time code to {user.email || 'your sign-in address'}, and
                you choose a new password with it.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Link className="rz-btn rz-btn-primary" to="/forgot-password">Reset password</Link>
              </div>
            </RzCard>
          </div>

          {/* ── Right: preferences + danger ── */}
          <div className="rz-stack" style={{ gap: 16 }}>
            <RzCard title="Preferences" size="lg">
              {[
                {
                  label: 'Dark interface',
                  desc: 'The instrument-panel theme. Light mode is available for bright rooms.',
                  value: darkMode,
                  onChange: () => toggleDarkMode(),
                  available: true,
                },
                {
                  label: 'Weekly email digest',
                  desc: 'A Monday summary of call volume, outcomes and spend. Not available yet.',
                  value: false,
                  onChange: () => {},
                  available: false,
                },
                {
                  label: 'Live call alerts',
                  desc: 'Notify me when an agent transfers a call to a human. Not available yet.',
                  value: false,
                  onChange: () => {},
                  available: false,
                },
              ].map((row, i, arr) => (
                <div
                  key={row.label}
                  className="rz-between"
                  style={{ padding: '11px 0', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--line)', opacity: row.available ? 1 : 0.6 }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--tx)' }}>{row.label}</div>
                    <div style={muted}>{row.desc}</div>
                  </div>
                  <RzSwitch checked={row.value} onChange={row.onChange} label={row.label} disabled={!row.available} />
                </div>
              ))}
            </RzCard>

            <RzCard title="Timezone" size="lg">
              <div className="rz-field">
                <select className="rz-select" disabled value="browser">
                  <option value="browser">Your browser's timezone</option>
                </select>
                <div className="rz-field-hint">
                  Dates and times in the console are shown in your browser's timezone. Choosing a different one
                  isn't available yet.
                </div>
              </div>
            </RzCard>

            <div className="rz-card rz-card-lg" style={{ borderColor: 'rgba(248,113,113,0.25)' }}>
              <div className="rz-title" style={{ color: 'var(--err)' }}>Danger zone</div>
              <p className="rz-sub" style={{ margin: '8px 0 14px', fontSize: 12.5 }}>
                Deleting your workspace removes all agents, calls and recordings. This cannot be undone.
              </p>
              <button
                className="rz-btn rz-btn-danger"
                onClick={() => toast.error('Workspace deletion is handled by support — contact us to proceed.')}
              >
                Delete workspace
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
