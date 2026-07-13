import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsApi, type Notification } from '@/lib/notificationsApi';
import { getAuth } from '@/lib/authStorage';
import type { SseHandle } from '@/lib/sseClient';

export function useNotifications(enabled = true) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<SseHandle | null>(null);

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
    const { token, workspaceId } = getAuth();
    if (!workspaceId || !token) return;

    streamRef.current?.close();
    streamRef.current = notificationsApi.openStream((event, raw) => {
      const data = raw ? JSON.parse(raw) : {};
      switch (event) {
        case 'notification:init':
          setUnreadCount(data.unreadCount ?? 0);
          break;
        case 'notification:new': {
          const n: Notification = data;
          setNotifications((prev) => [n, ...prev]);
          setUnreadCount((c) => c + 1);
          break;
        }
        case 'notification:read':
          setNotifications((prev) => prev.map((n) => (n.id === data.id ? { ...n, read: true } : n)));
          setUnreadCount((c) => Math.max(0, c - 1));
          break;
        case 'notification:read-all':
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
          setUnreadCount(0);
          break;
        case 'notification:deleted':
          setNotifications((prev) => {
            const target = prev.find((n) => n.id === data.id);
            if (target && !target.read) setUnreadCount((c) => Math.max(0, c - 1));
            return prev.filter((n) => n.id !== data.id);
          });
          break;
        case 'notification:cleared':
          setNotifications([]);
          setUnreadCount(0);
          break;
      }
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    fetchNotifications();
    connectSSE();
    return () => streamRef.current?.close();
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