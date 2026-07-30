import { Types } from 'mongoose';
import { Notification } from '../models/Notification';

export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  await Notification.create({
    userId: new Types.ObjectId(params.userId),
    type: params.type,
    title: params.title,
    body: params.body,
    link: params.link,
  });
}
