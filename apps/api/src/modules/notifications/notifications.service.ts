import { Notification, INotification } from '../../models/Notification';
import { AppError } from '../../lib/errors';

export async function listNotificationsForUser(
  userId: string,
  page: number,
  limit: number
): Promise<{ items: INotification[]; total: number; page: number; limit: number; unreadCount: number }> {
  const cappedLimit = Math.min(50, limit);
  const [items, total, unreadCount] = await Promise.all([
    Notification.find({ userId }).sort({ createdAt: -1 }).skip((page - 1) * cappedLimit).limit(cappedLimit),
    Notification.countDocuments({ userId }),
    Notification.countDocuments({ userId, readAt: { $exists: false } }),
  ]);
  return { items, total, page, limit: cappedLimit, unreadCount };
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<INotification> {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { readAt: new Date() },
    { new: true }
  );
  if (!notification) throw new AppError(404, 'Notification not found', 'NOTIFICATION_NOT_FOUND');
  return notification;
}
