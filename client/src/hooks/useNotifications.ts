import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsApi, type Notification } from '@/lib/notificationsApi';

export function useNotifications(enabled = true) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!enabled) return;
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
  }, [enabled]);

  const connectSSE = useCallback(() => {
    if (!enabled) return;
    const workspaceId = localStorage.getItem('workspaceId');
    const token = localStorage.getItem('token');
    if (!workspaceId || !token) return;

    eventSourceRef.current?.close();
    const es = new EventSource(notificationsApi.streamUrl());
    eventSourceRef.current = es;

    es.addEventListener('notification:init', (e) => {
      const data = JSON.parse(e.data);
      setUnreadCount(data.unreadCount ?? 0);
    });

    es.addEventListener('notification:new', (e) => {
      const n: Notification = JSON.parse(e.data);
      setNotifications((prev) => [n, ...prev]);
      setUnreadCount((c) => c + 1);
    });

    es.addEventListener('notification:read', (e) => {
      const { id } = JSON.parse(e.data);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    });

    es.addEventListener('notification:read-all', () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    });

    es.addEventListener('notification:deleted', (e) => {
      const { id } = JSON.parse(e.data);
      setNotifications((prev) => {
        const target = prev.find((n) => n.id === id);
        if (target && !target.read) setUnreadCount((c) => Math.max(0, c - 1));
        return prev.filter((n) => n.id !== id);
      });
    });

    es.addEventListener('notification:cleared', () => {
      setNotifications([]);
      setUnreadCount(0);
    });

    es.onerror = () => {
      es.close();
      setTimeout(connectSSE, 5000);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    fetchNotifications();
    connectSSE();
    return () => eventSourceRef.current?.close();
  }, [enabled, fetchNotifications, connectSSE]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
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
    const target = notifications.find((n) => n.id === id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (target && !target.read) setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await notificationsApi.delete(id);
    } catch {
      fetchNotifications();
    }
  }, [notifications, fetchNotifications]);

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