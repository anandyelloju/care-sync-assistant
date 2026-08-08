export type TimePreference = "morning" | "afternoon" | "evening";

export interface AppointmentRequest {
  doctorName: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  timePreference?: TimePreference;
}

export interface DoctorSlot {
  doctorName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  isBooked: boolean;
}

export interface AvailabilityResult {
  available: boolean;
  slots: DoctorSlot[];
}

export interface BookingResult {
  success: boolean;
  booking?: DoctorSlot;
  error?: string;
}

// Domain Errors
export class DoctorNotFoundError extends Error {
  constructor(doctorName: string) {
    super(`Doctor "${doctorName}" was not found in our database.`);
    this.name = "DoctorNotFoundError";
  }
}

export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRequestError";
  }
}

export class SlotNotFoundError extends Error {
  constructor(date: string, time: string) {
    super(`No slot found at ${time} on ${date}.`);
    this.name = "SlotNotFoundError";
  }
}

export class SlotUnavailableError extends Error {
  constructor(date: string, time: string) {
    super(`The slot at ${time} on ${date} is already booked.`);
    this.name = "SlotUnavailableError";
  }
}
