import { getRedis } from '../../lib/redis';

const LOCK_TTL_SECONDS = 300;

function lockKey(doctorId: string, slotStartISO: string): string {
  return `slot:${doctorId}:${slotStartISO}`;
}

export async function acquireSlotLock(doctorId: string, slotStartISO: string, patientId: string): Promise<boolean> {
  const result = await getRedis().set(lockKey(doctorId, slotStartISO), patientId, 'EX', LOCK_TTL_SECONDS, 'NX');
  return result === 'OK';
}

export async function releaseSlotLock(doctorId: string, slotStartISO: string): Promise<void> {
  await getRedis().del(lockKey(doctorId, slotStartISO));
}
