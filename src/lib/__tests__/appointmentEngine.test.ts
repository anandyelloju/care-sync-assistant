import { describe, it, expect, beforeEach } from "vitest";
import {
  checkAvailability,
  findAlternativeSlots,
  bookAppointment
} from "../appointmentEngine";
import { resetSchedule, getSchedule } from "../../data/mockSchedule";
import {
  DoctorNotFoundError,
  InvalidRequestError,
  SlotNotFoundError,
  SlotUnavailableError,
  DoctorSlot
} from "../../types/appointment";

describe("CareSync Appointment Engine", () => {
  beforeEach(() => {
    resetSchedule();
  });

  describe("checkAvailability()", () => {
    it("should successfully check an available exact slot", () => {
      const request = {
        doctorName: "Dr. Ravi",
        date: "2026-08-09",
        time: "09:00"
      };
      const result = checkAvailability(request);
      expect(result.available).toBe(true);
      expect(result.slots.length).toBe(1);
      expect(result.slots[0].doctorName).toBe("Dr. Ravi");
      expect(result.slots[0].isBooked).toBe(false);
    });

    it("should successfully check a booked exact slot", () => {
      const request = {
        doctorName: "Dr. Ravi",
        date: "2026-08-09",
        time: "09:30" // marked as true (booked) in INITIAL_SCHEDULE
      };
      const result = checkAvailability(request);
      expect(result.available).toBe(false);
      expect(result.slots.length).toBe(1);
      expect(result.slots[0].isBooked).toBe(true);
    });

    it("should throw DoctorNotFoundError for an unknown doctor", () => {
      const request = {
        doctorName: "Dr. Strange",
        date: "2026-08-09",
        time: "09:00"
      };
      expect(() => checkAvailability(request)).toThrow(DoctorNotFoundError);
    });

    it("should throw SlotNotFoundError when checking a non-existent slot time", () => {
      const request = {
        doctorName: "Dr. Ravi",
        date: "2026-08-09",
        time: "22:00" // Doctor doesn't have 22:00
      };
      expect(() => checkAvailability(request)).toThrow(SlotNotFoundError);
    });

    it("should check morning availability correctly", () => {
      const request = {
        doctorName: "Dr. Ravi",
        date: "2026-08-09",
        timePreference: "morning" as const
      };
      const result = checkAvailability(request);
      // Dr. Ravi morning slots: 09:00 (free), 09:30 (booked), 10:00 (booked), 10:30 (free), 11:00 (free), 11:30 (booked)
      expect(result.available).toBe(true);
      expect(result.slots.length).toBe(6);
      
      const freeSlots = result.slots.filter(s => !s.isBooked);
      expect(freeSlots.map(s => s.time)).toEqual(["09:00", "10:30", "11:00"]);
    });

    it("should check afternoon availability correctly", () => {
      const request = {
        doctorName: "Dr. Priya",
        date: "2026-08-09",
        timePreference: "afternoon" as const
      };
      const result = checkAvailability(request);
      // Dr. Priya afternoon slots on 2026-08-09: 13:00 (booked), 13:30 (free), 14:00 (free), 14:30 (booked), 15:00 (free), 15:30 (free)
      expect(result.available).toBe(true);
      expect(result.slots.length).toBe(6);
      
      const freeSlots = result.slots.filter(s => !s.isBooked);
      expect(freeSlots.map(s => s.time)).toEqual(["13:30", "14:00", "15:00", "15:30"]);
    });

    it("should handle empty slot list for a timePreference when doctor works no hours in that bracket", () => {
      const request = {
        doctorName: "Dr. Ravi",
        date: "2026-08-10",
        timePreference: "evening" as const
      };
      const result = checkAvailability(request);
      expect(result.available).toBe(false);
      expect(result.slots.length).toBe(0);
    });

    it("should throw InvalidRequestError if request validation fails", () => {
      const requestEmptyDoctor = {
        doctorName: "",
        date: "2026-08-09",
        time: "09:00"
      };
      expect(() => checkAvailability(requestEmptyDoctor)).toThrow(InvalidRequestError);

      const requestInvalidDate = {
        doctorName: "Dr. Ravi",
        date: "09-08-2026",
        time: "09:00"
      };
      expect(() => checkAvailability(requestInvalidDate)).toThrow(InvalidRequestError);

      const requestNoTimeOrPref = {
        doctorName: "Dr. Ravi",
        date: "2026-08-09"
      };
      expect(() => checkAvailability(requestNoTimeOrPref)).toThrow(InvalidRequestError);
    });
  });

  describe("findAlternativeSlots()", () => {
    it("should suggest up to 3 available alternative slots close to the target time", () => {
      // Dr. Ravi 2026-08-09 at 10:00 is booked.
      // Available slots nearby: 10:30 (30m), 09:00 (60m), 11:00 (60m), 13:00 (180m), etc.
      const request = {
        doctorName: "Dr. Ravi",
        date: "2026-08-09",
        time: "10:00"
      };
      const alternatives = findAlternativeSlots(request);
      expect(alternatives.length).toBe(3);
      expect(alternatives[0].time).toBe("10:30"); // 30 mins away
      expect(alternatives[1].time).toBe("09:00"); // 60 mins away (earlier)
      expect(alternatives[2].time).toBe("11:00"); // 60 mins away (later)
      
      // None of the alternatives should be booked
      alternatives.forEach(alt => {
        expect(alt.isBooked).toBe(false);
        expect(alt.doctorName).toBe("Dr. Ravi");
      });
    });

    it("should fall back to alternative days if no slots are available on the requested day", () => {
      // Create a scenario where all slots for Dr. Ravi on 2026-08-09 are booked
      const schedule = getSchedule();
      schedule.forEach(s => {
        if (s.doctorName === "Dr. Ravi" && s.date === "2026-08-09") {
          s.isBooked = true;
        }
      });

      const request = {
        doctorName: "Dr. Ravi",
        date: "2026-08-09",
        time: "10:00"
      };
      const alternatives = findAlternativeSlots(request);
      
      // Should recommend slots on 2026-08-10
      expect(alternatives.length).toBe(3);
      expect(alternatives[0].date).toBe("2026-08-10");
      expect(alternatives[0].isBooked).toBe(false);
    });

    it("should suggest slots close to a time preference reference when exact time is not provided", () => {
      const request = {
        doctorName: "Dr. Priya",
        date: "2026-08-09",
        timePreference: "afternoon" as const // middle reference is 14:30
      };
      // Dr. Priya available slots around 14:30: 14:00 (30m), 15:00 (30m), 13:30 (60m), 15:30 (60m)
      const alternatives = findAlternativeSlots(request);
      expect(alternatives.length).toBe(3);
      
      // Expected closest: 14:00, 15:00, 13:30 (earlier tie-breaker)
      expect(alternatives.map(a => a.time)).toEqual(["14:00", "15:00", "13:30"]);
    });
  });

  describe("bookAppointment()", () => {
    it("should successfully book an available slot and mutate database state", () => {
      const request = {
        doctorName: "Dr. Ravi",
        date: "2026-08-09",
        time: "09:00"
      };
      
      // Pre-check
      const initialAvailability = checkAvailability(request);
      expect(initialAvailability.available).toBe(true);

      const result = bookAppointment(request);
      expect(result.success).toBe(true);
      expect(result.booking?.isBooked).toBe(true);
      
      // Post-check availability
      const postAvailability = checkAvailability(request);
      expect(postAvailability.available).toBe(false);
    });

    it("should throw SlotUnavailableError when attempting to book an already-booked slot", () => {
      const request = {
        doctorName: "Dr. Ravi",
        date: "2026-08-09",
        time: "09:30" // Already booked
      };

      expect(() => bookAppointment(request)).toThrow(SlotUnavailableError);
    });

    it("should throw SlotNotFoundError when booking a non-existent slot", () => {
      const request = {
        doctorName: "Dr. Ravi",
        date: "2026-08-09",
        time: "04:00" // Not on schedule
      };

      expect(() => bookAppointment(request)).toThrow(SlotNotFoundError);
    });

    it("should throw InvalidRequestError if time is missing during booking", () => {
      const request = {
        doctorName: "Dr. Ravi",
        date: "2026-08-09",
        timePreference: "morning" as const
      };

      expect(() => bookAppointment(request)).toThrow(InvalidRequestError);
    });

    it("should not overwrite any other slot details or other bookings on mutation", () => {
      const bookingRequest = {
        doctorName: "Dr. Ravi",
        date: "2026-08-09",
        time: "09:00"
      };

      // Record other slots before booking
      const originalSchedule = JSON.parse(JSON.stringify(getSchedule()));

      // Book Dr. Ravi
      bookAppointment(bookingRequest);

      // Fetch new schedule
      const postSchedule = getSchedule();

      // Check all slots except the booked one match exactly
      originalSchedule.forEach((oldSlot: DoctorSlot, index: number) => {
        const newSlot = postSchedule[index];
        if (
          oldSlot.doctorName === "Dr. Ravi" &&
          oldSlot.date === "2026-08-09" &&
          oldSlot.time === "09:00"
        ) {
          expect(newSlot.isBooked).toBe(true);
        } else {
          expect(newSlot.isBooked).toBe(oldSlot.isBooked);
          expect(newSlot.doctorName).toBe(oldSlot.doctorName);
          expect(newSlot.date).toBe(oldSlot.date);
          expect(newSlot.time).toBe(oldSlot.time);
        }
      });
    });
  });
});
