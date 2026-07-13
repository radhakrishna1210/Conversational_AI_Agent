import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Check, Trash2 } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import type { Notification } from '@/lib/notificationsApi';

interface Props {
  open: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

function parseDetails(details?: string | null): string[] {
  if (!details) return [];
  try {
    const parsed = JSON.parse(details);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return details.split('\n').map((s) => s.trim()).filter(Boolean);
  }
}

function formatGroupDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (today.getTime() - target.getTime()) / 86400000;

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function groupNotifications(items: Notification[]) {
  const unread = items.filter((n) => !n.read);
  const read = items.filter((n) => n.read);

  const groupByDate = (list: Notification[]) => {
    const map = new Map<string, Notification[]>();
    for (const n of list) {
      const key = formatGroupDate(n.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return Array.from(map.entries()).map(([label, notifications]) => ({ label, notifications }));
  };

  return {
    unread,
    readGroups: groupByDate(read),
    unreadGroups: groupByDate(unread),
  };
}

function NotificationRow({
  notification,
  onMarkRead,
  onDelete,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const bullets = parseDetails(notification.details);

  return (
    <article
      className={`notification-item ${notification.read ? 'is-read' : 'is-unread'}`}
      onClick={() => !notification.read && onMarkRead(notification.id)}
    >
      <div className="notification-item-header">
        <span className="notification-item-type">{notification.type}</span>
        <time className="notification-item-date">
          {new Date(notification.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </time>
      </div>

      <h3 className="notification-item-title">{notification.title}</h3>
      <p className="notification-item-message">{notification.message}</p>

      {bullets.length > 0 && (
        <ul className="notification-item-list">
          {bullets.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}

      {notification.actionText && notification.actionLink && (
        <a
          href={notification.actionLink}
          className="notification-item-action"
          onClick={(e) => e.stopPropagation()}
        >
          {notification.actionText}
        </a>
      )}

      <div className="notification-item-actions" onClick={(e) => e.stopPropagation()}>
        {!notification.read && (
          <button
            type="button"
            className="notification-action-btn"
            title="Mark as read"
            aria-label="Mark as read"
            onClick={() => onMarkRead(notification.id)}
          >
            <Check size={14} />
          </button>
        )}
        <button
          type="button"
          className="notification-action-btn notification-action-btn-danger"
          title="Dismiss"
          aria-label="Dismiss notification"
          onClick={() => onDelete(notification.id)}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

export function NotificationPanel({ open, onClose, onUnreadCountChange }: Props) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, loading, error, markRead, markAllRead, deleteOne } =
    useNotifications(open);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const grouped = useMemo(() => groupNotifications(notifications), [notifications]);
  const hasNotifications = notifications.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="notification-backdrop"
            className="notification-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.aside
            key="notification-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-panel-title"
            tabIndex={-1}
            className="notification-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="notification-panel-header">
              <div className="notification-panel-header-main">
                <h2 id="notification-panel-title" className="notification-panel-title">
                  Notifications
                </h2>
                {unreadCount > 0 && (
                  <button type="button" className="notification-mark-all" onClick={markAllRead}>
                    Mark all as read
                  </button>
                )}
              </div>
              <button
                type="button"
                className="notification-panel-close"
                onClick={onClose}
                aria-label="Close notifications"
              >
                <X size={18} />
              </button>
            </header>

            <div className="notification-panel-body">
            {error && (
              <div style={{ padding: '10px 14px', margin: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', fontSize: 12 }}>
                Couldn’t load notifications: {error}. This usually means the backend or database is unreachable.
              </div>
            )}
              {loading ? (
                <div className="notification-loading" aria-live="polite" aria-busy="true">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="notification-skeleton">
                      <div className="notification-skeleton-line w-1/3" />
                      <div className="notification-skeleton-line w-2/3" />
                      <div className="notification-skeleton-line w-full" />
                    </div>
                  ))}
                </div>
              
) : !hasNotifications ? (
  <div className="notification-empty-wrapper">
    <p className="notification-empty">No active notifications</p>
  </div>
) : (
                <div className="notification-list">
                  {grouped.unread.length > 0 && (
                    <section className="notification-group">
                      <h3 className="notification-group-label">Unread</h3>
                      {grouped.unreadGroups.map((group) => (
                        <div key={`unread-${group.label}`}>
                          {grouped.unreadGroups.length > 1 && (
                            <h4 className="notification-subgroup-label">{group.label}</h4>
                          )}
                          {group.notifications.map((n) => (
                            <NotificationRow
                              key={n.id}
                              notification={n}
                              onMarkRead={markRead}
                              onDelete={deleteOne}
                            />
                          ))}
                        </div>
                      ))}
                    </section>
                  )}

                  {grouped.readGroups.map((group) => (
                    <section key={group.label} className="notification-group">
                      <h3 className="notification-group-label">{group.label}</h3>
                      {group.notifications.map((n) => (
                        <NotificationRow
                          key={n.id}
                          notification={n}
                          onMarkRead={markRead}
                          onDelete={deleteOne}
                        />
                      ))}
                    </section>
                  ))}
                </div>
              )}
            </div>

            <footer className="notification-panel-footer">
  <button
    type="button"
    className="notification-archived-link"
    onClick={() => {
  onClose();
  navigate('/notifications/archive');
}}
  >
    View Archived Notifications
  </button>
</footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
