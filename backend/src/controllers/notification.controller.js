import prisma from '../config/prisma.js';

export const listNotifications = async (req, res) => {
  const { workspaceId } = req.params;
  
  const notifications = await prisma.notification.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  res.json(notifications);
};

export const markAsRead = async (req, res) => {
  const { id } = req.params;
  
  const notification = await prisma.notification.update({
    where: { id },
    data: { read: true },
  });

  res.json(notification);
};

export const markAllAsRead = async (req, res) => {
  const { workspaceId } = req.params;
  
  await prisma.notification.updateMany({
    where: { workspaceId, read: false },
    data: { read: true },
  });

  res.json({ message: 'All notifications marked as read' });
};

export const createNotification = async (req, res) => {
  const { workspaceId } = req.params;
  const { title, message, type, details, actionText, actionLink } = req.body;

  const notification = await prisma.notification.create({
    data: {
      workspaceId,
      title,
      message,
      type: type || 'INFO',
      details: details || null,
      actionText: actionText || null,
      actionLink: actionLink || null,
    },
  });

  res.status(201).json(notification);
};
