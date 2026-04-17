import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export default function Settings() {
  const [user, setUser] = useState({ name: '', email: '', phone: '' });
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [timezone, setTimezone] = useState('New York (GMT-5)');

  useEffect(() => {
    const name = localStorage.getItem('userName') || '';
    const email = localStorage.getItem('userEmail') || '';
    setUser(prev => ({ ...prev, name, email }));
  }, []);

  const handleSavePersonal = () => {
    if (!user.name || !user.email) {
      toast.error('Please fill in name and email');
      return;
    }
    // Simulate API call
    toast.success('Personal information updated successfully!');
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
    // Simulate API call
    toast.success('Password changed successfully!');
    setPasswords({ current: '', new: '', confirm: '' });
  };

  const handleSaveTimezone = () => {
    toast.success(`Timezone saved as ${timezone}`);
  };

  return (
    <>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>Settings</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Manage your account settings and preferences
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1000px' }}>
        
        {/* Personal Information */}
        <div style={{ 
          border: '1px solid var(--border)', 
          borderRadius: '8px', 
          background: 'rgba(255,255,255,0.01)',
          padding: '24px 32px'
        }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, margin: '0 0 6px 0', color: 'white' }}>
            <span style={{ color: 'var(--teal)', fontSize: '16px' }}>👤</span> Personal Information
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 24px 0' }}>
            Update your name and phone number
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Name</label>
              <input 
                type="text" 
                className="form-input" 
                value={user.name} 
                onChange={(e) => setUser({...user, name: e.target.value})}
                style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }} 
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Email</label>
              <input 
                type="email" 
                className="form-input" 
                value={user.email} 
                onChange={(e) => setUser({...user, email: e.target.value})}
                style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }} 
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Phone</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Your phone number" 
                value={user.phone}
                onChange={(e) => setUser({...user, phone: e.target.value})}
                style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }} 
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              onClick={handleSavePersonal}
              style={{
                background: 'var(--teal)',
                color: 'var(--bg-primary)',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Save changes
            </button>
          </div>
        </div>

        {/* Security */}
        <div style={{ 
          border: '1px solid var(--border)', 
          borderRadius: '8px', 
          background: 'rgba(255,255,255,0.01)',
          padding: '24px 32px'
        }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, margin: '0 0 6px 0', color: 'white' }}>
            <span style={{ color: 'var(--teal)', fontSize: '16px' }}>🔒</span> Security
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 24px 0' }}>
            Change your account password
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Current Password</label>
              <input 
                type="password" 
                className="form-input" 
                placeholder="Enter current password" 
                value={passwords.current}
                onChange={(e) => setPasswords({...passwords, current: e.target.value})}
                style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }} 
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>New Password</label>
              <input 
                type="password" 
                className="form-input" 
                placeholder="Enter new password" 
                value={passwords.new}
                onChange={(e) => setPasswords({...passwords, new: e.target.value})}
                style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }} 
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Confirm New Password</label>
              <input 
                type="password" 
                className="form-input" 
                placeholder="Confirm new password" 
                value={passwords.confirm}
                onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }} 
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              onClick={handleSavePassword}
              style={{
                background: 'var(--teal)',
                color: 'var(--bg-primary)',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Change password
            </button>
          </div>
        </div>

        {/* Preferences */}
        <div style={{ 
          border: '1px solid var(--border)', 
          borderRadius: '8px', 
          background: 'rgba(255,255,255,0.01)',
          padding: '24px 32px'
        }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, margin: '0 0 6px 0', color: 'white' }}>
            <span style={{ color: 'var(--teal)', fontSize: '16px' }}>🌐</span> Preferences
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 24px 0' }}>
            Manage your timezone and display settings
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Timezone</label>
              <select 
                className="form-select" 
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                style={{ width: '100%', background: 'rgba(0,0,0,0.2)', backgroundImage: 'none', padding: '10px 14px', color: 'white' }}
              >
                <option value="Los Angeles (GMT-7)">Los Angeles (GMT-7)</option>
                <option value="New York (GMT-5)">New York (GMT-5)</option>
                <option value="London (GMT+0)">London (GMT+0)</option>
                <option value="Tokyo (GMT+9)">Tokyo (GMT+9)</option>
              </select>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '8px 0 0 0' }}>
                This will be used for displaying dates and times throughout the application.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              onClick={handleSaveTimezone}
              style={{
                background: 'var(--teal)',
                color: 'var(--bg-primary)',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Save timezone
            </button>
          </div>
        </div>

      </div>

    </>
  );
}
