import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsApi, type Notification } from '@/lib/notificationsApi';
import { getAuth } from '@/lib/authStorage';
import type { SseHandle } from '@/lib/sseClient';

/**
 * Notifications for the dashboard shell.
 *
 * The unread count and the list have different lifetimes. The count drives the
 * bell badge, which is on screen the whole session, so the stream that keeps it
 * current stays connected for as long as the hook is mounted. The list is only
 * needed while the panel is open, so it is (re)loaded each time `listOpen`
 * becomes true. Tying both to the panel being open left the badge frozen at its
 * mount-time value while the panel was closed — i.e. almost always.
 */
export function useNotifications(listOpen = true) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<SseHandle | null>(null);
  // Read inside the stream handler, which is created once per mount.
  const notificationsRef = useRef<Notification[]>([]);
  notificationsRef.current = notifications;

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await notificationsApi.list({ limit: 50 });
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  const syncUnreadCount = useCallback(() => {
    notificationsApi
      .unreadCount()
      .then((data) => setUnreadCount(data.count ?? 0))
      .catch(() => { /* the stream's next event corrects it */ });
  }, []);

  // Stream + initial count: for the life of the component, not the panel.
  useEffect(() => {
    const { token, workspaceId } = getAuth();
    if (!workspaceId || !token) return;

    // The stream's notification:init also carries the count; this covers a
    // stream that cannot connect (e.g. a proxy buffering event-streams).
    syncUnreadCount();

    streamRef.current?.close();
    streamRef.current = notificationsApi.openStream((event, raw) => {
      let data: Record<string, unknown> = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { return; }
      switch (event) {
        case 'notification:init':
          setUnreadCount(Number(data.unreadCount) || 0);
          break;
        case 'notification:new': {
          const n = data as unknown as Notification;
          setNotifications((prev) => [n, ...prev]);
          setUnreadCount((c) => c + 1);
          break;
        }
        case 'notification:read': {
          const target = notificationsRef.current.find((n) => n.id === data.id);
          setNotifications((prev) => prev.map((n) => (n.id === data.id ? { ...n, read: true } : n)));
          // Only a notification we know was unread moves the count locally. One
          // outside the loaded list (the panel was never opened, or it was read
          // from the archive page) may already have been read — ask instead.
          if (target) {
            if (!target.read) setUnreadCount((c) => Math.max(0, c - 1));
          } else {
            syncUnreadCount();
          }
          break;
        }
        case 'notification:read-all':
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
          setUnreadCount(0);
          break;
        case 'notification:deleted': {
          const target = notificationsRef.current.find((n) => n.id === data.id);
          setNotifications((prev) => prev.filter((n) => n.id !== data.id));
          if (target) {
            if (!target.read) setUnreadCount((c) => Math.max(0, c - 1));
          } else {
            syncUnreadCount();
          }
          break;
        }
        case 'notification:cleared':
          setNotifications([]);
          setUnreadCount(0);
          break;
      }
    });
    return () => {
      streamRef.current?.close();
      streamRef.current = null;
    };
  }, [syncUnreadCount]);

  // The list: loaded each time the panel opens, so it is never stale on show.
  useEffect(() => {
    if (listOpen) fetchNotifications();
  }, [listOpen, fetchNotifications]);

  const markRead = useCallback(async (id: string) => {
    const target = notificationsRef.current.find((n) => n.id === id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    if (target && !target.read) setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await notificationsApi.markRead(id);
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await notificationsApi.markAllRead();
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  const deleteOne = useCallback(async (id: string) => {
    const target = notificationsRef.current.find((n) => n.id === id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (target && !target.read) setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await notificationsApi.delete(id);
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markRead,
    markAllRead,
    deleteOne,
    refresh: fetchNotifications,
  };
}
