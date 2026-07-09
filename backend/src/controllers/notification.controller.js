import prisma from '../config/prisma.js';
import { addClient, broadcast, initSseResponse } from '../lib/sse.js';

// ── GET /notifications ─────────────────────────────────────────────────────────
export const listNotifications = async (req, res) => {
  const { workspaceId } = req.params;
  const { unread, type, limit = '50', cursor } = req.query;

  try {
    const where = { workspaceId };
    if (unread === 'true') where.read = false;
    if (type) where.type = type.toUpperCase();
    if (cursor) where.createdAt = { lt: new Date(cursor) };

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit, 10) || 50, 100),
    });

    const unreadCount = await prisma.notification.count({
      where: { workspaceId, read: false },
    });

    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('[notifications] listNotifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

// ── GET /notifications/unread-count ───────────────────────────────────────────
export const getUnreadCount = async (req, res) => {
  const { workspaceId } = req.params;

  try {
    const count = await prisma.notification.count({
      where: { workspaceId, read: false },
    });
    res.json({ count });
  } catch (err) {
    console.error('[notifications] getUnreadCount error:', err);
    // Return 0 instead of crashing — the badge just shows nothing
    res.json({ count: 0 });
  }
};

// ── PATCH /notifications/:id/read ─────────────────────────────────────────────
export const markAsRead = async (req, res) => {
  const { id, workspaceId } = req.params;

  try {
    const notification = await prisma.notification.update({
      where: { id, workspaceId },
      data: { read: true },
    });

    broadcast(workspaceId, 'notification:read', { id });
    res.json(notification);
  } catch (err) {
    console.error('[notifications] markAsRead error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

// ── PATCH /notifications/read-all ─────────────────────────────────────────────
export const markAllAsRead = async (req, res) => {
  const { workspaceId } = req.params;

  try {
    await prisma.notification.updateMany({
      where: { workspaceId, read: false },
      data: { read: true },
    });

    broadcast(workspaceId, 'notification:read-all', {});
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('[notifications] markAllAsRead error:', err);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
};

// ── DELETE /notifications/:id ─────────────────────────────────────────────────
export const deleteNotification = async (req, res) => {
  const { id, workspaceId } = req.params;

  try {
    await prisma.notification.delete({ where: { id, workspaceId } });

    broadcast(workspaceId, 'notification:deleted', { id });
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('[notifications] deleteNotification error:', err);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
};

// ── DELETE /notifications ─────────────────────────────────────────────────────
export const clearAllNotifications = async (req, res) => {
  const { workspaceId } = req.params;

  try {
    await prisma.notification.deleteMany({ where: { workspaceId } });

    broadcast(workspaceId, 'notification:cleared', {});
    res.json({ message: 'All notifications cleared' });
  } catch (err) {
    console.error('[notifications] clearAllNotifications error:', err);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
};

// ── POST /notifications ───────────────────────────────────────────────────────
export const createNotification = async (req, res) => {
  const { workspaceId } = req.params;
  const { title, message, type, details, actionText, actionLink } = req.body;

  try {
    const notification = await prisma.notification.create({
      data: {
        workspaceId,
        title,
        message,
        type: (type || 'INFO').toUpperCase(),
        details: details || null,
        actionText: actionText || null,
        actionLink: actionLink || null,
      },
    });

    // Push real-time update to all connected clients in this workspace
    broadcast(workspaceId, 'notification:new', notification);

    res.status(201).json(notification);
  } catch (err) {
    console.error('[notifications] createNotification error:', err);
    res.status(500).json({ error: 'Failed to create notification' });
  }
};

// ── GET /notifications/stream  (SSE) ─────────────────────────────────────────
export const streamNotifications = async (req, res) => {
  const { workspaceId } = req.params;

  try {
    initSseResponse(res);
    addClient(workspaceId, res);

    // Send unread count immediately on connect
    const count = await prisma.notification.count({
      where: { workspaceId, read: false },
    });
    res.write(`event: notification:init\ndata: ${JSON.stringify({ unreadCount: count })}\n\n`);

    // Heartbeat every 25s to prevent proxy timeouts
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 25000);

    req.on('close', () => clearInterval(heartbeat));
  } catch (err) {
    console.error('[notifications] streamNotifications error:', err);
    // SSE response may already be initialised — send a safe init with 0
    try {
      res.write(`event: notification:init\ndata: ${JSON.stringify({ unreadCount: 0 })}\n\n`);
    } catch (_) {
      // ignore if headers already sent
    }
  }
};
