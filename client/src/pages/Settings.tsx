import { useState, useEffect } from 'react';
import { toast } from 'sonner';

/* ── types ── */
interface UserProfile {
  name: string;
  email: string;
  phone: string;
}

interface Passwords {
  current: string;
  new: string;
  confirm: string;
}

/* ── icons (inline SVGs matching OmniDimension style) ── */
const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const GlobeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

const SaveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const EyeIcon = ({ open }: { open: boolean }) => open ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

/* ── component ── */
export default function Settings() {
  const [user, setUser] = useState<UserProfile>({ name: '', email: '', phone: '' });
  const [passwords, setPasswords] = useState<Passwords>({ current: '', new: '', confirm: '' });
  const [timezone, setTimezone] = useState('New York (GMT-5)');
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });
  const [saving, setSaving] = useState({ personal: false, password: false, timezone: false });

  /* ── validation helpers ── */
  const validateName = (name: string) => /^[A-Za-z ]{2,50}$/.test(name.trim());
  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePhone = (phone: string) => /^\+?[1-9]\d{9,14}$/.test(phone.trim());

  useEffect(() => {
    const name = localStorage.getItem('userName') || '';
    const email = localStorage.getItem('userEmail') || '';
    const phone = localStorage.getItem('userPhone') || '';
    const tz = localStorage.getItem('userTimezone') || 'New York (GMT-5)';
    setUser(prev => ({ ...prev, name, email, phone }));
    setTimezone(tz);
  }, []);

  const handleSavePersonal = async () => {
    if (!validateName(user.name)) {
      toast.error('Name should contain only letters and spaces (2-50 characters).');
      return;
    }
    if (!validateEmail(user.email)) {
      toast.error('Please enter a valid email address.');
      return;
    }
    if (!user.phone) {
      toast.error('Phone number is required.');
      return;
    }
    if (!validatePhone(user.phone)) {
      toast.error('Please enter a valid phone number (10-15 digits, optional + prefix).');
      return;
    }

    setSaving(prev => ({ ...prev, personal: true }));
    try {
      // ── BACKEND INTEGRATION POINT ──
      // Replace with your actual API call:
      // await whapi.patch('/user/profile', { name: user.name, email: user.email, phone: user.phone });
      await new Promise(r => setTimeout(r, 600));

      localStorage.setItem('userName', user.name);
      localStorage.setItem('userEmail', user.email);
      localStorage.setItem('userPhone', user.phone);
      toast.success('Personal information updated successfully!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(prev => ({ ...prev, personal: false }));
    }
  };

  const handleSavePassword = async () => {
    if (!passwords.current || !passwords.new || !passwords.confirm) {
      toast.error('Please fill in all password fields.');
      return;
    }
    if (passwords.new !== passwords.confirm) {
      toast.error('New passwords do not match.');
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

    setSaving(prev => ({ ...prev, password: true }));
    try {
      // ── BACKEND INTEGRATION POINT ──
      // Replace with your actual API call:
      // await whapi.post('/user/change-password', { currentPassword: passwords.current, newPassword: passwords.new });
      await new Promise(r => setTimeout(r, 600));

      toast.success('Password changed successfully!');
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSaving(prev => ({ ...prev, password: false }));
    }
  };

  const handleSaveTimezone = async () => {
    setSaving(prev => ({ ...prev, timezone: true }));
    try {
      // ── BACKEND INTEGRATION POINT ──
      // Replace with your actual API call:
      // await whapi.patch('/user/preferences', { timezone });
      await new Promise(r => setTimeout(r, 400));

      localStorage.setItem('userTimezone', timezone);
      toast.success(`Timezone saved as ${timezone}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save timezone');
    } finally {
      setSaving(prev => ({ ...prev, timezone: false }));
    }
  };

  return (
    <div className="settings-page">
      {/* ── Page Header ── */}
      <div className="settings-header">
        <h1>Settings</h1>
        <p>Manage your account settings and preferences</p>
      </div>

      <div className="settings-grid">

        {/* ── Personal Information ── */}
        <div className="settings-card">
          <div className="settings-card-head">
            <div className="settings-card-icon">
              <UserIcon />
            </div>
            <div className="settings-card-title">
              <h2>Personal Information</h2>
              <p>Update your name and phone number</p>
            </div>
          </div>

          <div className="settings-form">
            <div className="settings-form-group">
              <label className="settings-label">Name</label>
              <input
                type="text"
                className="settings-input"
                value={user.name}
                onChange={(e) => {
                  const value = e.target.value;
                  if (/^[A-Za-z ]*$/.test(value)) {
                    setUser(prev => ({ ...prev, name: value }));
                  }
                }}
                placeholder="Your full name"
              />
            </div>

            <div className="settings-form-group">
              <label className="settings-label">Email</label>
              <input
                type="email"
                className="settings-input"
                value={user.email}
                onChange={(e) => setUser(prev => ({ ...prev, email: e.target.value }))}
                placeholder="your@email.com"
              />
            </div>

            <div className="settings-form-group">
              <label className="settings-label">Phone</label>
              <input
                type="text"
                className="settings-input"
                placeholder="Your phone number"
                value={user.phone}
                onChange={(e) => {
                  const value = e.target.value;
                  if (/^[0-9+]*$/.test(value)) {
                    setUser(prev => ({ ...prev, phone: value }));
                  }
                }}
              />
            </div>
          </div>

          <div className="settings-card-footer">
            <button
              className="settings-btn-primary"
              onClick={handleSavePersonal}
              disabled={saving.personal}
            >
              {saving.personal ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>

        {/* ── Security ── */}
        <div className="settings-card">
          <div className="settings-card-head">
            <div className="settings-card-icon">
              <LockIcon />
            </div>
            <div className="settings-card-title">
              <h2>Security</h2>
              <p>Change your account password</p>
            </div>
          </div>

          <div className="settings-form">
            <div className="settings-form-group">
              <label className="settings-label">Current Password</label>
              <div className="settings-input-wrap">
                <input
                  type={showPasswords.current ? 'text' : 'password'}
                  className="settings-input"
                  placeholder="Enter current password"
                  value={passwords.current}
                  onChange={(e) => setPasswords(prev => ({ ...prev, current: e.target.value }))}
                />
                <button
                  className="settings-input-eye"
                  onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                  type="button"
                  tabIndex={-1}
                >
                  <EyeIcon open={showPasswords.current} />
                </button>
              </div>
            </div>

            <div className="settings-form-group">
              <label className="settings-label">New Password</label>
              <div className="settings-input-wrap">
                <input
                  type={showPasswords.new ? 'text' : 'password'}
                  className="settings-input"
                  placeholder="Enter new password"
                  value={passwords.new}
                  onChange={(e) => setPasswords(prev => ({ ...prev, new: e.target.value }))}
                />
                <button
                  className="settings-input-eye"
                  onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                  type="button"
                  tabIndex={-1}
                >
                  <EyeIcon open={showPasswords.new} />
                </button>
              </div>
            </div>

            <div className="settings-form-group">
              <label className="settings-label">Confirm New Password</label>
              <div className="settings-input-wrap">
                <input
                  type={showPasswords.confirm ? 'text' : 'password'}
                  className="settings-input"
                  placeholder="Confirm new password"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords(prev => ({ ...prev, confirm: e.target.value }))}
                />
                <button
                  className="settings-input-eye"
                  onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                  type="button"
                  tabIndex={-1}
                >
                  <EyeIcon open={showPasswords.confirm} />
                </button>
              </div>
            </div>
          </div>

          <div className="settings-card-footer">
            <button
              className="settings-btn-primary"
              onClick={handleSavePassword}
              disabled={saving.password}
            >
              {saving.password ? 'Changing…' : 'Change password'}
            </button>
          </div>
        </div>

        {/* ── Preferences ── */}
        <div className="settings-card">
          <div className="settings-card-head">
            <div className="settings-card-icon">
              <GlobeIcon />
            </div>
            <div className="settings-card-title">
              <h2>Preferences</h2>
              <p>Manage your timezone and display settings</p>
            </div>
          </div>

          <div className="settings-form">
            <div className="settings-form-group">
              <label className="settings-label">Timezone</label>
              <div className="settings-select-wrap">
                <select
                  className="settings-select"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  <option value="Los Angeles (GMT-7)">Los Angeles (GMT-7)</option>
                  <option value="New York (GMT-5)">New York (GMT-5)</option>
                  <option value="London (GMT+0)">London (GMT+0)</option>
                  <option value="Tokyo (GMT+9)">Tokyo (GMT+9)</option>
                  <option value="Sydney (GMT+11)">Sydney (GMT+11)</option>
                  <option value="Berlin (GMT+1)">Berlin (GMT+1)</option>
                  <option value="Dubai (GMT+4)">Dubai (GMT+4)</option>
                  <option value="Singapore (GMT+8)">Singapore (GMT+8)</option>
                </select>
                <ChevronDownIcon />
              </div>
              <p className="settings-hint">
                This will be used for displaying dates and times throughout the application.
              </p>
            </div>
          </div>

          <div className="settings-card-footer">
            <button
              className="settings-btn-primary"
              onClick={handleSaveTimezone}
              disabled={saving.timezone}
            >
              {saving.timezone ? 'Saving…' : 'Save timezone'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}