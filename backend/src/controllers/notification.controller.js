import prisma from '../config/prisma.js';
import { addClient, broadcast, initSseResponse } from '../lib/sse.js';

// ── GET /notifications ─────────────────────────────────────────────────────────
export const listNotifications = async (req, res) => {
  const { workspaceId } = req.params;
  const { unread, type, limit = '50', cursor } = req.query;

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
};

// ── GET /notifications/unread-count ───────────────────────────────────────────
export const getUnreadCount = async (req, res) => {
  const { workspaceId } = req.params;
  const count = await prisma.notification.count({
    where: { workspaceId, read: false },
  });
  res.json({ count });
};

// ── PATCH /notifications/:id/read ─────────────────────────────────────────────
export const markAsRead = async (req, res) => {
  const { id, workspaceId } = req.params;

  const notification = await prisma.notification.update({
    where: { id, workspaceId },
    data: { read: true },
  });

  broadcast(workspaceId, 'notification:read', { id });
  res.json(notification);
};

// ── PATCH /notifications/read-all ─────────────────────────────────────────────
export const markAllAsRead = async (req, res) => {
  const { workspaceId } = req.params;

  await prisma.notification.updateMany({
    where: { workspaceId, read: false },
    data: { read: true },
  });

  broadcast(workspaceId, 'notification:read-all', {});
  res.json({ message: 'All notifications marked as read' });
};

// ── DELETE /notifications/:id ─────────────────────────────────────────────────
export const deleteNotification = async (req, res) => {
  const { id, workspaceId } = req.params;

  await prisma.notification.delete({ where: { id, workspaceId } });

  broadcast(workspaceId, 'notification:deleted', { id });
  res.json({ message: 'Notification deleted' });
};

// ── DELETE /notifications ─────────────────────────────────────────────────────
export const clearAllNotifications = async (req, res) => {
  const { workspaceId } = req.params;

  await prisma.notification.deleteMany({ where: { workspaceId } });

  broadcast(workspaceId, 'notification:cleared', {});
  res.json({ message: 'All notifications cleared' });
};

// ── POST /notifications ───────────────────────────────────────────────────────
export const createNotification = async (req, res) => {
  const { workspaceId } = req.params;
  const { title, message, type, details, actionText, actionLink } = req.body;

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
};

// ── GET /notifications/stream  (SSE) ─────────────────────────────────────────
export const streamNotifications = async (req, res) => {
  const { workspaceId } = req.params;

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
};
