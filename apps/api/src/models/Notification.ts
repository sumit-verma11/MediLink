import { Schema, model, Types } from 'mongoose';

export interface INotification {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: string;
  title: string;
  body: string;
  link?: string;
  readAt?: Date;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  link: String,
  readAt: Date,
  createdAt: { type: Date, default: Date.now },
});

export const Notification = model<INotification>('Notification', notificationSchema);
