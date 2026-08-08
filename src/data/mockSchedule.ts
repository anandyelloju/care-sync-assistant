import { DoctorSlot } from "../types/appointment";

export const INITIAL_SCHEDULE: DoctorSlot[] = [
  // Dr. Ravi - 2026-08-09
  { doctorName: "Dr. Ravi", date: "2026-08-09", time: "09:00", isBooked: false },
  { doctorName: "Dr. Ravi", date: "2026-08-09", time: "09:30", isBooked: true }, // Booked
  { doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:00", isBooked: true }, // Booked
  { doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30", isBooked: false },
  { doctorName: "Dr. Ravi", date: "2026-08-09", time: "11:00", isBooked: false },
  { doctorName: "Dr. Ravi", date: "2026-08-09", time: "11:30", isBooked: true }, // Booked
  { doctorName: "Dr. Ravi", date: "2026-08-09", time: "13:00", isBooked: false },
  { doctorName: "Dr. Ravi", date: "2026-08-09", time: "13:30", isBooked: false },
  { doctorName: "Dr. Ravi", date: "2026-08-09", time: "14:00", isBooked: true }, // Booked
  { doctorName: "Dr. Ravi", date: "2026-08-09", time: "14:30", isBooked: false },
  { doctorName: "Dr. Ravi", date: "2026-08-09", time: "15:00", isBooked: false },
  { doctorName: "Dr. Ravi", date: "2026-08-09", time: "15:30", isBooked: true }, // Booked
  { doctorName: "Dr. Ravi", date: "2026-08-09", time: "17:00", isBooked: false },
  { doctorName: "Dr. Ravi", date: "2026-08-09", time: "17:30", isBooked: false },

  // Dr. Ravi - 2026-08-10 (Next Day)
  { doctorName: "Dr. Ravi", date: "2026-08-10", time: "09:00", isBooked: false },
  { doctorName: "Dr. Ravi", date: "2026-08-10", time: "09:30", isBooked: false },
  { doctorName: "Dr. Ravi", date: "2026-08-10", time: "10:00", isBooked: false },
  { doctorName: "Dr. Ravi", date: "2026-08-10", time: "10:30", isBooked: false },
  { doctorName: "Dr. Ravi", date: "2026-08-10", time: "14:00", isBooked: false },
  { doctorName: "Dr. Ravi", date: "2026-08-10", time: "14:30", isBooked: false },

  // Dr. Priya - 2026-08-09
  { doctorName: "Dr. Priya", date: "2026-08-09", time: "09:00", isBooked: false },
  { doctorName: "Dr. Priya", date: "2026-08-09", time: "09:30", isBooked: false },
  { doctorName: "Dr. Priya", date: "2026-08-09", time: "10:00", isBooked: false },
  { doctorName: "Dr. Priya", date: "2026-08-09", time: "10:30", isBooked: true }, // Booked
  { doctorName: "Dr. Priya", date: "2026-08-09", time: "11:00", isBooked: true }, // Booked
  { doctorName: "Dr. Priya", date: "2026-08-09", time: "11:30", isBooked: false },
  { doctorName: "Dr. Priya", date: "2026-08-09", time: "13:00", isBooked: true }, // Booked
  { doctorName: "Dr. Priya", date: "2026-08-09", time: "13:30", isBooked: false },
  { doctorName: "Dr. Priya", date: "2026-08-09", time: "14:00", isBooked: false },
  { doctorName: "Dr. Priya", date: "2026-08-09", time: "14:30", isBooked: true }, // Booked
  { doctorName: "Dr. Priya", date: "2026-08-09", time: "15:00", isBooked: false },
  { doctorName: "Dr. Priya", date: "2026-08-09", time: "15:30", isBooked: false },
  { doctorName: "Dr. Priya", date: "2026-08-09", time: "17:00", isBooked: false },
  { doctorName: "Dr. Priya", date: "2026-08-09", time: "17:30", isBooked: true }, // Booked

  // Dr. Priya - 2026-08-10 (Next Day)
  { doctorName: "Dr. Priya", date: "2026-08-10", time: "09:00", isBooked: true }, // Booked
  { doctorName: "Dr. Priya", date: "2026-08-10", time: "09:30", isBooked: false },
  { doctorName: "Dr. Priya", date: "2026-08-10", time: "13:00", isBooked: false },
  { doctorName: "Dr. Priya", date: "2026-08-10", time: "13:30", isBooked: false }
];

// Mutable state representing the source of truth database
let currentSchedule: DoctorSlot[] = JSON.parse(JSON.stringify(INITIAL_SCHEDULE));

/**
 * Gets the current in-memory schedule.
 */
export function getSchedule(): DoctorSlot[] {
  return currentSchedule;
}

/**
 * Resets the in-memory schedule to the initial template.
 */
export function resetSchedule(): void {
  currentSchedule = JSON.parse(JSON.stringify(INITIAL_SCHEDULE));
}

/**
 * Updates a slot status. Mutates the source of truth schedule.
 * Returns true if successful, false if the slot was not found.
 */
export function updateSlotStatus(
  doctorName: string,
  date: string,
  time: string,
  isBooked: boolean
): boolean {
  const slot = currentSchedule.find(
    (s) =>
      s.doctorName.toLowerCase() === doctorName.toLowerCase() &&
      s.date === date &&
      s.time === time
  );
  if (!slot) {
    return false;
  }
  slot.isBooked = isBooked;
  return true;
}

/**
 * Returns a list of all doctor names present in the schedule database.
 */
export function getAvailableDoctors(): string[] {
  const doctors = currentSchedule.map((s) => s.doctorName);
  return Array.from(new Set(doctors));
}
