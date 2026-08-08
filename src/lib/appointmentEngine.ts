import {
  AppointmentRequest,
  AvailabilityResult,
  BookingResult,
  DoctorNotFoundError,
  InvalidRequestError,
  SlotNotFoundError,
  SlotUnavailableError,
  DoctorSlot,
  TimePreference
} from "../types/appointment";
import {
  getSchedule,
  updateSlotStatus,
  getAvailableDoctors
} from "../data/mockSchedule";

/**
 * Validates the structure and content of an AppointmentRequest.
 */
function validateRequest(
  request: AppointmentRequest,
  requireTime: boolean = false
): void {
  if (!request) {
    throw new InvalidRequestError("Request details must be provided.");
  }
  
  if (!request.doctorName || request.doctorName.trim() === "") {
    throw new InvalidRequestError("Doctor name is required.");
  }
  
  if (!request.date || !/^\d{4}-\d{2}-\d{2}$/.test(request.date)) {
    throw new InvalidRequestError("Date must be in YYYY-MM-DD format.");
  }
  
  // Verify doctor exists in the system
  const doctors = getAvailableDoctors().map((d) => d.toLowerCase());
  if (!doctors.includes(request.doctorName.toLowerCase())) {
    throw new DoctorNotFoundError(request.doctorName);
  }
  
  if (requireTime) {
    if (!request.time || !/^\d{2}:\d{2}$/.test(request.time)) {
      throw new InvalidRequestError("Exact time is required in HH:MM format.");
    }
  } else {
    if (!request.time && !request.timePreference) {
      throw new InvalidRequestError(
        "Either exact time or timePreference must be specified."
      );
    }
    if (request.timePreference && !["morning", "afternoon", "evening"].includes(request.timePreference)) {
      throw new InvalidRequestError(
        "Invalid timePreference. Must be 'morning', 'afternoon', or 'evening'."
      );
    }
  }
}

/**
 * Helper to determine if a time string falls into a specific preference category.
 * - morning: 08:00 <= time < 12:00
 * - afternoon: 12:00 <= time < 17:00
 * - evening: 17:00 <= time < 21:00
 */
function slotMatchesPreference(time: string, preference: TimePreference): boolean {
  const [hour] = time.split(":").map(Number);
  if (isNaN(hour)) return false;
  
  switch (preference) {
    case "morning":
      return hour >= 8 && hour < 12;
    case "afternoon":
      return hour >= 12 && hour < 17;
    case "evening":
      return hour >= 17 && hour < 21;
    default:
      return false;
  }
}

/**
 * Checks availability for a specific doctor, date, and exact time/time-preference.
 */
export function checkAvailability(
  request: AppointmentRequest
): AvailabilityResult {
  validateRequest(request);
  
  const schedule = getSchedule();
  const normalizedDoctor = request.doctorName.toLowerCase();
  
  if (request.time) {
    // Exact slot check
    const slot = schedule.find(
      (s) =>
        s.doctorName.toLowerCase() === normalizedDoctor &&
        s.date === request.date &&
        s.time === request.time
    );
    
    if (!slot) {
      throw new SlotNotFoundError(request.date, request.time);
    }
    
    return {
      available: !slot.isBooked,
      slots: [slot]
    };
  } else {
    // Preference window check
    const matchedSlots = schedule.filter(
      (s) =>
        s.doctorName.toLowerCase() === normalizedDoctor &&
        s.date === request.date &&
        slotMatchesPreference(s.time, request.timePreference!)
    );
    
    return {
      available: matchedSlots.some((s) => !s.isBooked),
      slots: matchedSlots
    };
  }
}

/**
 * Calculates distance in minutes between a slot and a target date/time reference.
 */
function calculateSlotDistance(
  slot: DoctorSlot,
  targetDateStr: string,
  targetTimeStr: string
): number {
  const slotTime = new Date(`${slot.date}T${slot.time}:00`);
  const targetTime = new Date(`${targetDateStr}T${targetTimeStr}:00`);
  
  // Difference in minutes
  const diffMs = Math.abs(slotTime.getTime() - targetTime.getTime());
  return Math.floor(diffMs / (1000 * 60));
}

/**
 * Suggests up to 3 alternative available slots, sorted by closeness to the request.
 */
export function findAlternativeSlots(
  request: AppointmentRequest
): DoctorSlot[] {
  validateRequest(request);
  
  const schedule = getSchedule();
  const normalizedDoctor = request.doctorName.toLowerCase();
  
  // Find all available slots for this doctor
  const availableSlots = schedule.filter(
    (s) => s.doctorName.toLowerCase() === normalizedDoctor && !s.isBooked
  );
  
  // Determine reference time for distance calculations
  let referenceTime = "10:00"; // default reference
  if (request.time) {
    referenceTime = request.time;
  } else if (request.timePreference) {
    if (request.timePreference === "afternoon") {
      referenceTime = "14:30";
    } else if (request.timePreference === "evening") {
      referenceTime = "18:30";
    }
  }
  
  // Sort slots deterministically by:
  // 1. Distance in minutes (date + time difference combined)
  // 2. Chronological order (date then time)
  const sorted = [...availableSlots].sort((a, b) => {
    const distA = calculateSlotDistance(a, request.date, referenceTime);
    const distB = calculateSlotDistance(b, request.date, referenceTime);
    
    if (distA !== distB) {
      return distA - distB;
    }
    
    // Tie-breaker: Chronological order
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return a.time.localeCompare(b.time);
  });
  
  return sorted.slice(0, 3);
}

/**
 * Books an appointment slot, updating the source of truth database.
 * Checks availability immediately before confirming the booking.
 */
export function bookAppointment(request: AppointmentRequest): BookingResult {
  // Validate request, requiring the exact time to book
  validateRequest(request, true);
  
  const schedule = getSchedule();
  const normalizedDoctor = request.doctorName.toLowerCase();
  
  // Fetch slot
  const slot = schedule.find(
    (s) =>
      s.doctorName.toLowerCase() === normalizedDoctor &&
      s.date === request.date &&
      s.time === request.time
  );
  
  if (!slot) {
    throw new SlotNotFoundError(request.date, request.time!);
  }
  
  if (slot.isBooked) {
    throw new SlotUnavailableError(request.date, request.time!);
  }
  
  // Perform booking (mutate state)
  const updated = updateSlotStatus(request.doctorName, request.date, request.time!, true);
  
  if (!updated) {
    return {
      success: false,
      error: "An unexpected error occurred while booking the slot."
    };
  }
  
  return {
    success: true,
    booking: {
      ...slot,
      isBooked: true
    }
  };
}
