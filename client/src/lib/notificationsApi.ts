const BASE = '/api/v1';

import { getAuth } from './authStorage';
import { authFetch } from './authFetch';
import { openSseStream, type SseHandle } from './sseClient';

// Every call goes through authFetch, which attaches the CURRENT token and
// refreshes on 401. These used raw fetch with the stored token, so once the
// ~15-min access token expired every notification call failed.

function workspaceBase() {
  const { workspaceId } = getAuth();
  return `${BASE}/workspaces/${workspaceId}/notifications`;
}

export interface Notification {
  id: string;
  workspaceId: string;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'CAMPAIGN' | 'MESSAGE' | 'SYSTEM';
  read: boolean;
  details?: string | null;
  actionText?: string | null;
  actionLink?: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  notifications: Notification[];
  unreadCount: number;
}

export const notificationsApi = {
  list: async (params?: { unread?: boolean; type?: string; limit?: number }): Promise<NotificationListResponse> => {
    const qs = new URLSearchParams();
    if (params?.unread) qs.set('unread', 'true');
    if (params?.type) qs.set('type', params.type);
    if (params?.limit) qs.set('limit', String(params.limit));
    const res = await authFetch(`${workspaceBase()}?${qs}`);
    if (!res.ok) throw new Error('Failed to fetch notifications');
    return res.json();
  },

  unreadCount: async (): Promise<{ count: number }> => {
    const res = await authFetch(`${workspaceBase()}/unread-count`);
    if (!res.ok) throw new Error('Failed to fetch unread count');
    return res.json();
  },

  markRead: async (id: string): Promise<Notification> => {
    const res = await authFetch(`${workspaceBase()}/${id}/read`, {
      method: 'PATCH',
    });
    if (!res.ok) throw new Error('Failed to mark as read');
    return res.json();
  },

  markAllRead: async (): Promise<void> => {
    const res = await authFetch(`${workspaceBase()}/read-all`, {
      method: 'PATCH',
    });
    if (!res.ok) throw new Error('Failed to mark all as read');
  },

  delete: async (id: string): Promise<void> => {
    const res = await authFetch(`${workspaceBase()}/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete notification');
  },

  clearAll: async (): Promise<void> => {
    const res = await authFetch(`${workspaceBase()}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to clear notifications');
  },

  /**
   * Open the real-time notification stream. Authenticates via the
   * Authorization header (fetch-based SSE) — the bearer token is never
   * placed in the URL, and it is re-read on every reconnect.
   */
  openStream: (onEvent: (event: string, data: string) => void, onError?: (err: unknown) => void): SseHandle | null => {
    const { token, workspaceId } = getAuth();
    if (!token || !workspaceId) return null;
    return openSseStream(`${BASE}/workspaces/${workspaceId}/notifications/stream`, {
      onEvent,
      onError,
    });
  },
};