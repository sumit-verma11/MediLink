import { Types } from 'mongoose';
import { AvailabilityRule } from '../../models/AvailabilityRule';
import { BlockedDate } from '../../models/BlockedDate';
import { Appointment } from '../../models/Appointment';

export interface Slot {
  start: Date;
  end: Date;
}

const ACTIVE_STATUSES = ['requested', 'confirmed'];

function parseTimeToMinutes(hhmm: string): number {
  const parts = hhmm.split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  return hours * 60 + minutes;
}

// Every doctor and patient is in Delhi-NCR (CLAUDE.md's non-goals rule out
// multi-region support for v1), so AvailabilityRule.startTime/endTime are always
// clinic-local IST wall-clock times, not UTC. Slot instants must be computed
// against IST day boundaries, or every slot ends up shifted by 5:30 once a
// browser renders the (correctly UTC) Date in the visitor's local timezone.
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function startOfISTDayInUTC(date: Date): Date {
  const istShifted = new Date(date.getTime() + IST_OFFSET_MS);
  const istMidnightAsUTC = Date.UTC(istShifted.getUTCFullYear(), istShifted.getUTCMonth(), istShifted.getUTCDate());
  return new Date(istMidnightAsUTC - IST_OFFSET_MS);
}

export async function generateSlotsForDoctor(doctorId: string, fromDate: Date, days: number): Promise<Slot[]> {
  const rangeStart = startOfISTDayInUTC(fromDate);
  const rangeEnd = new Date(rangeStart.getTime() + days * 24 * 60 * 60 * 1000);

  const [rules, blockedDates, bookedAppointments] = await Promise.all([
    AvailabilityRule.find({
      doctorId: new Types.ObjectId(doctorId),
      validFrom: { $lte: rangeEnd },
      validTo: { $gte: rangeStart },
    }),
    BlockedDate.find({ doctorId: new Types.ObjectId(doctorId), date: { $gte: rangeStart, $lt: rangeEnd } }),
    Appointment.find({
      doctorId: new Types.ObjectId(doctorId),
      status: { $in: ACTIVE_STATUSES },
      slotStart: { $gte: rangeStart, $lt: rangeEnd },
    }),
  ]);

  const blockedDateKeys = new Set(blockedDates.map((b) => startOfISTDayInUTC(b.date).getTime()));
  const bookedStartTimes = new Set(bookedAppointments.map((a) => a.slotStart.getTime()));

  const rulesByDayOfWeek = new Map<number, typeof rules>();
  for (const rule of rules) {
    const existing = rulesByDayOfWeek.get(rule.dayOfWeek) ?? [];
    existing.push(rule);
    rulesByDayOfWeek.set(rule.dayOfWeek, existing);
  }

  const slots: Slot[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const day = new Date(rangeStart.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    if (blockedDateKeys.has(day.getTime())) continue;

    // `day` is midnight IST expressed as a UTC instant, which lands on the *previous*
    // UTC calendar date -- shift back by the offset to read the IST weekday it's really for.
    const dayOfWeek = new Date(day.getTime() + IST_OFFSET_MS).getUTCDay();
    const rulesForDay = rulesByDayOfWeek.get(dayOfWeek) ?? [];

    for (const rule of rulesForDay) {
      if (rule.validFrom > day || rule.validTo < day) continue;

      const startMinutes = parseTimeToMinutes(rule.startTime);
      const endMinutes = parseTimeToMinutes(rule.endTime);

      for (let minutes = startMinutes; minutes + rule.slotMinutes <= endMinutes; minutes += rule.slotMinutes) {
        const slotStart = new Date(day.getTime() + minutes * 60 * 1000);
        const slotEnd = new Date(slotStart.getTime() + rule.slotMinutes * 60 * 1000);
        // Today's range starts at 00:00 IST, so the first day of any generation window
        // contains slots that have already passed. They are not bookable (createAppointment
        // rejects a past slotStart), so they must not be offered.
        if (slotStart.getTime() <= Date.now()) continue;
        if (bookedStartTimes.has(slotStart.getTime())) continue;
        slots.push({ start: slotStart, end: slotEnd });
      }
    }
  }

  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}
