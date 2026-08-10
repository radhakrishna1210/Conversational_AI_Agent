import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useTheme } from '../hooks/useTheme';
import { RzCard, RzSwitch } from '@/components/rz';

/**
 * Settings — the two-column account panel from Spandan Account.dc.html#settings.
 *
 * Profile on the left, preferences and the danger zone stacked on the right.
 */

const validateName  = (name: string)  => /^[A-Za-z ]{2,50}$/.test(name.trim());
const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validatePhone = (phone: string) => /^\+?[1-9]\d{9,14}$/.test(phone.trim());

const TIMEZONES = [
  'Los Angeles (GMT-7)',
  'New York (GMT-5)',
  'London (GMT+0)',
  'Kolkata (GMT+5:30)',
  'Tokyo (GMT+9)',
];

export default function Settings() {
  const [user, setUser] = useState({ name: '', email: '', phone: '' });
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [timezone, setTimezone] = useState('New York (GMT-5)');
  const { darkMode, toggleDarkMode } = useTheme();

  // Local-only preferences. Persisted to localStorage so a reload keeps them;
  // they gate client-side behaviour only, so there is no endpoint to call.
  const [emailDigest, setEmailDigest] = useState(() => localStorage.getItem('prefEmailDigest') !== '0');
  const [callAlerts, setCallAlerts] = useState(() => localStorage.getItem('prefCallAlerts') !== '0');

  useEffect(() => {
    const name = localStorage.getItem('userName') || '';
    const email = localStorage.getItem('userEmail') || '';
    setUser(prev => ({ ...prev, name, email }));
  }, []);

  const setPref = (key: string, value: boolean, set: (v: boolean) => void) => {
    set(value);
    localStorage.setItem(key, value ? '1' : '0');
  };

  const initials = (user.name || 'U')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleSavePersonal = () => {
    if (!validateName(user.name))   { toast.error('Name should contain only letters and spaces.'); return; }
    if (!validateEmail(user.email)) { toast.error('Please enter a valid email address.'); return; }
    if (!user.phone)                { toast.error('Phone number is required.'); return; }
    if (!validatePhone(user.phone)) { toast.error('Please enter a valid phone number.'); return; }

    toast.success('Personal information updated');
    localStorage.setItem('userName', user.name);
    localStorage.setItem('userEmail', user.email);
  };

  const handleSavePassword = () => {
    if (!passwords.current || !passwords.new || !passwords.confirm) {
      toast.error('Please fill in all password fields');
      return;
    }
    if (passwords.new !== passwords.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    if (passwords.new.length < 8) {
      toast.error('Password must be at least 8 characters long.');
      return;
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(passwords.new)) {
      toast.error('Password must contain uppercase, lowercase and a number.');
      return;
    }
    toast.success('Password changed');
    setPasswords({ current: '', new: '', confirm: '' });
  };

  const handleSaveTimezone = () => toast.success(`Timezone saved as ${timezone}`);

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
                  <input
                    id="set-name"
                    className="rz-input"
                    type="text"
                    value={user.name}
                    onChange={(e) => {
                      // Reject digits at the keystroke rather than on submit —
                      // the field only ever accepts letters and spaces.
                      if (/^[A-Za-z ]*$/.test(e.target.value)) setUser({ ...user, name: e.target.value });
                    }}
                  />
                </div>
                <div className="rz-field">
                  <label className="rz-field-label" htmlFor="set-email">Email</label>
                  <input
                    id="set-email"
                    className="rz-input"
                    type="email"
                    value={user.email}
                    onChange={(e) => setUser({ ...user, email: e.target.value })}
                  />
                </div>
                <div className="rz-field">
                  <label className="rz-field-label" htmlFor="set-phone">Phone</label>
                  <input
                    id="set-phone"
                    className="rz-input"
                    type="tel"
                    placeholder="+919876543210"
                    value={user.phone}
                    onChange={(e) => {
                      if (/^[0-9+]*$/.test(e.target.value)) setUser({ ...user, phone: e.target.value });
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                <button className="rz-btn rz-btn-primary" onClick={handleSavePersonal}>Save changes</button>
              </div>
            </RzCard>

            <RzCard title="Security" size="lg">
              <p className="rz-sub" style={{ margin: '-6px 0 16px' }}>Change your account password.</p>
              <div className="rz-stack" style={{ gap: 14 }}>
                {([
                  ['current', 'Current password', 'Enter current password'],
                  ['new', 'New password', 'At least 8 characters'],
                  ['confirm', 'Confirm new password', 'Repeat the new password'],
                ] as const).map(([key, label, placeholder]) => (
                  <div className="rz-field" key={key}>
                    <label className="rz-field-label" htmlFor={`set-pw-${key}`}>{label}</label>
                    <input
                      id={`set-pw-${key}`}
                      className="rz-input"
                      type="password"
                      placeholder={placeholder}
                      value={passwords[key]}
                      onChange={(e) => setPasswords({ ...passwords, [key]: e.target.value })}
                    />
                  </div>
                ))}
                <div className="rz-field-hint">
                  Must mix upper case, lower case and a digit.
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                <button className="rz-btn rz-btn-primary" onClick={handleSavePassword}>Change password</button>
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
                },
                {
                  label: 'Weekly email digest',
                  desc: 'A Monday summary of call volume, outcomes and spend.',
                  value: emailDigest,
                  onChange: (v: boolean) => setPref('prefEmailDigest', v, setEmailDigest),
                },
                {
                  label: 'Live call alerts',
                  desc: 'Notify me when an agent transfers a call to a human.',
                  value: callAlerts,
                  onChange: (v: boolean) => setPref('prefCallAlerts', v, setCallAlerts),
                },
              ].map((row, i, arr) => (
                <div
                  key={row.label}
                  className="rz-between"
                  style={{ padding: '11px 0', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--line)' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--tx)' }}>{row.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 2 }}>{row.desc}</div>
                  </div>
                  <RzSwitch checked={row.value} onChange={row.onChange} label={row.label} />
                </div>
              ))}
            </RzCard>

            <RzCard title="Timezone" size="lg">
              <div className="rz-field">
                <select className="rz-select" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
                <div className="rz-field-hint">
                  Used for every date and time shown in the console, including call timestamps.
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="rz-btn rz-btn-secondary" onClick={handleSaveTimezone}>Save timezone</button>
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
