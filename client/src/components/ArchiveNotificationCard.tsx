export default function ArchiveNotificationCard({
  notification,
}: any) {
  return (
    <div className="archive-card">
      <div className="archive-card-header">
        <span
          className={`archive-badge ${
            notification.category === 'announcement'
              ? 'announcement-badge'
              : ''
          }`}
        >
          {notification.type}
        </span>

        <span className="archive-date">
          {notification.date}
        </span>
      </div>

      <h3>{notification.title}</h3>

      <p>{notification.description}</p>

      {notification.tag && (
        <button className="archive-tag">
          {notification.tag}
        </button>
      )}

      <h4>What you can do:</h4>

      <ul>
        {notification.points.map(
          (point: string, index: number) => (
            <li key={index}>✅ {point}</li>
          )
        )}
      </ul>
    </div>
  );
}