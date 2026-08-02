import { Types } from 'mongoose';
import { AvailabilityRule } from '../../models/AvailabilityRule';
import { BlockedDate } from '../../models/BlockedDate';
import { Appointment } from '../../models/Appointment';

export interface Slot {
  start: Date;
  end: Date;
}

const ACTIVE_STATUSES = ['requested', 'confirmed'];

// AvailabilityRule.startTime/endTime are wall-clock times in India Standard Time
// (every doctor/clinic in this project is India-based, per CLAUDE.md) but slotStart/
// slotEnd are stored as UTC instants. IST is UTC+5:30, so an IST wall-clock time
// converts to UTC by subtracting this offset.
const IST_OFFSET_MINUTES = 5 * 60 + 30;

function parseTimeToMinutes(hhmm: string): number {
  const parts = hhmm.split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  return hours * 60 + minutes;
}

// The UTC instant of IST midnight for the IST calendar date that `date` falls on.
// Shifting forward by the IST offset before flooring to a UTC day, then shifting back,
// correctly finds IST midnight even when `date` is UTC-morning/previous-UTC-day relative
// to its IST calendar date.
function startOfISTDay(date: Date): Date {
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  const flooredShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(flooredShifted - IST_OFFSET_MINUTES * 60 * 1000);
}

// The day-of-week (0=Sunday..6=Saturday) as seen on the IST calendar for the IST day
// that begins at `istMidnight` (a UTC instant produced by startOfISTDay).
function istDayOfWeek(istMidnight: Date): number {
  return new Date(istMidnight.getTime() + IST_OFFSET_MINUTES * 60 * 1000).getUTCDay();
}

export async function generateSlotsForDoctor(doctorId: string, fromDate: Date, days: number): Promise<Slot[]> {
  const rangeStart = startOfISTDay(fromDate);
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

  const blockedDateKeys = new Set(blockedDates.map((b) => startOfISTDay(b.date).getTime()));
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

    const dayOfWeek = istDayOfWeek(day);
    const rulesForDay = rulesByDayOfWeek.get(dayOfWeek) ?? [];

    for (const rule of rulesForDay) {
      if (rule.validFrom > day || rule.validTo < day) continue;

      const startMinutes = parseTimeToMinutes(rule.startTime);
      const endMinutes = parseTimeToMinutes(rule.endTime);

      for (let minutes = startMinutes; minutes + rule.slotMinutes <= endMinutes; minutes += rule.slotMinutes) {
        // `day` is already the UTC instant of IST midnight (startOfISTDay), so adding
        // IST-wall-clock minutes-since-midnight directly yields the correct UTC instant.
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
