import { useEffect, useState } from 'react';
import { whapi } from '../lib/whapi';
import { format } from 'date-fns';
import { Sparkles, Megaphone, CheckCircle2 } from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'FEATURE' | 'ANNOUNCEMENT';
  date: string;
  actionText?: string;
  actionLink?: string;
  list?: string[];
  read: boolean;
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'features' | 'announcements'>('all');
  const [loading, setLoading] = useState(true);

  const workspaceId = localStorage.getItem('workspaceId');

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const data = await whapi.get<any[]>(`/notifications`);
        
        if (data && data.length > 0) {
          const mapped = data.map(n => ({
            id: n.id,
            title: n.title,
            message: n.message,
            type: n.type,
            date: format(new Date(n.createdAt), 'MMM dd, yyyy'),
            actionText: n.actionText,
            actionLink: n.actionLink,
            list: n.details?.items || [],
            read: n.read
          }));
          setNotifications(mapped);
        } else {
          // Fallback mock data for design demonstration
          setNotifications([
            {
              id: '1',
              title: 'Free Voice Cloning!',
              message: 'Now you can clone your own voice or your favorite voice to be used with your voice AI agent!',
              type: 'FEATURE',
              date: 'Feb 25, 2026',
              actionText: 'Voice Cloning',
              list: [
                'Upload a 20 to 30 second recording of the voice you would like to clone, OR',
                'Record your own voice on our dashboard and clone it real-time!',
                'Use the cloned voice directly in your voice AI bot.'
              ],
              read: false
            },
            {
              id: '2',
              title: 'OmniDimension Telephony is live',
              message: 'With OmniDimension Telephony, you can now request and manage +1, and +91 phone numbers directly in OmniDimension, and, connect each number to a specific agent.',
              type: 'FEATURE',
              date: 'Jan 27, 2026',
              list: [
                'Request numbers + concurrency (channels)',
                'Map phone numbers to agents inside your dashboard',
                'Track real-time usage and capacityGo live in less than 2 minutes....'
              ],
              read: true
            },
            {
              id: '3',
              title: 'Youtube Series Launch',
              message: 'Checkout our voice AI video playlist on YouTube',
              type: 'ANNOUNCEMENT',
              date: 'Jan 19, 2026',
              read: true
            }
          ]);
        }
      } catch (err) {
        console.error('Failed to fetch notifications', err);
      } finally {
        setLoading(false);
      }
    };

    if (workspaceId) fetchNotifications();
  }, [workspaceId]);

  const filteredNotifications = notifications.filter(n => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'features') return n.type === 'FEATURE';
    if (activeFilter === 'announcements') return n.type === 'ANNOUNCEMENT';
    return true;
  });

  return (
    <div className="notifications-page">
      <div className="archive-header">
        <div className="archive-title-group">
          <h1>Notification Archive</h1>
          <p>Stay updated with the latest features and announcements.</p>
        </div>
        
        <div className="archive-filters">
          <button 
            className={`filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            All
          </button>
          <button 
            className={`filter-btn ${activeFilter === 'features' ? 'active' : ''}`}
            onClick={() => setActiveFilter('features')}
          >
            Features
          </button>
          <button 
            className={`filter-btn ${activeFilter === 'announcements' ? 'active' : ''}`}
            onClick={() => setActiveFilter('announcements')}
          >
            Announcements
          </button>
        </div>
      </div>

      <div className="notifications-grid">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading updates...</div>
        ) : filteredNotifications.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No updates found.</div>
        ) : (
          filteredNotifications.map((notif) => (
            <div key={notif.id} className="notif-card">
              <div className="notif-card-head">
                <div className={`notif-tag ${notif.type === 'ANNOUNCEMENT' ? 'announcement' : ''}`}>
                  {notif.type === 'FEATURE' ? <Sparkles size={12} /> : <Megaphone size={12} />}
                  {notif.type}
                </div>
                <div className="notif-date">{notif.date}</div>
              </div>
              
              <h3>{notif.title}</h3>
              <p>{notif.message}</p>

              {notif.actionText && (
                <button className="notif-btn">{notif.actionText}</button>
              )}

              {notif.list && (
                <div style={{ marginTop: '10px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '12px' }}>What you can do:</p>
                  <ul className="notif-list">
                    {notif.list.map((item, idx) => (
                      <li key={idx}>
                        <CheckCircle2 className="notif-list-icon" size={14} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
