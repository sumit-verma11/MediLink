import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { logAudit } from './audit.service';
import { AuditLog } from '../../models/AuditLog';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterEach(async () => {
  await AuditLog.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('logAudit', () => {
  it('persists an audit entry with a timestamp', async () => {
    const actorId = new mongoose.Types.ObjectId();
    const entityId = new mongoose.Types.ObjectId();
    await logAudit({ actorId: actorId.toString(), actorRole: 'patient', action: 'user.register', entityType: 'User', entityId: entityId.toString() });

    const entries = await AuditLog.find({});
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe('user.register');
    expect(entries[0]!.at).toBeInstanceOf(Date);
  });
});
