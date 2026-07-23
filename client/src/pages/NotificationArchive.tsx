import { useState } from 'react';
import ArchiveHeader from '../components/ArchiveHeader';
import ArchiveFilters from '../components/ArchiveFilters';
import ArchiveNotificationCard from '../components/ArchiveNotificationCard';

export default function NotificationArchive() {
  const [activeTab, setActiveTab] = useState('all');

  const notifications = [
    {
      category: 'feature',
      type: 'Feature',
      date: 'Feb 25, 2026',
      title: 'Free Voice Cloning!',
      description:
        'Now you can clone your own voice or your favorite voice to be used with your voice AI agent!',
      tag: 'Voice Cloning',
      points: [
        'Upload a 20 to 30 second recording of the voice you would like to clone',
        'Record your own voice on our dashboard and instantly create a clone',
      ],
    },
    {
      category: 'feature',
      type: 'Feature',
      date: 'Jan 27, 2026',
      title: 'Conversational AI Agent Telephony is live',
      description:
        'With Conversational AI Agent Telephony, you can now request and manage +1 and +91 phone numbers directly in Conversational AI Agent.',
      points: [
        'Request numbers + concurrency (channels)',
        'Map phone numbers to agents inside your workspace',
      ],
    },
    {
      category: 'announcement',
      type: 'Announcement',
      date: 'Jun 20, 2026',
      title: 'Scheduled Maintenance',
      description:
        'Our platform will undergo maintenance on June 25 from 2 AM to 4 AM UTC.',
      points: [
        'Temporary service interruption',
        'Improved performance after maintenance',
      ],
    },
  ];

  const filteredNotifications =
    activeTab === 'all'
      ? notifications
      : notifications.filter(
          (notification) => notification.category === activeTab
        );

  return (
    <div className="archive-page">
      <div className="archive-banner">
        <span>📅 Need help getting started? Talk to our team.</span>

        <button className="archive-banner-btn">
          Book a Meeting →
        </button>
      </div>

      <div className="archive-content">
        <div className="archive-top-row">
          <ArchiveHeader />

          <ArchiveFilters
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        </div>

        <div className="archive-grid">
          {filteredNotifications.map((notification, index) => (
            <ArchiveNotificationCard
              key={index}
              notification={notification}
            />
          ))}
        </div>
      </div>
    </div>
  );
}