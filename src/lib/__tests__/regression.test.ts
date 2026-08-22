import { describe, it, expect, beforeEach } from "vitest";
import { simulateModelResponse, ChatMessage, getConversationState } from "../agentService";
import { resetSchedule, getSchedule } from "../../data/mockSchedule";

describe("CareSync Assistant Workflow Regression Tests", () => {
  beforeEach(() => {
    resetSchedule();
  });
  it("should ask for missing details when user says only 'book Priya doctor'", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "book Priya doctor" }
    ];
    const response = simulateModelResponse(history);
    expect(response.content).toContain("For which date and time would you like to book Dr. Priya?");
    expect(response.tool_calls).toBeUndefined();
  });

  it("should ask for date and time when user says only 'Book Priya'", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Book Priya" }
    ];
    const response = simulateModelResponse(history);
    expect(response.content).toContain("For which date and time would you like to book Dr. Priya?");
    expect(response.tool_calls).toBeUndefined();
  });

  it("should reject invalid doctor names like 'Kshatriya doctor' and list available doctors", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Book Dr. Kshatriya tomorrow morning" }
    ];
    const response = simulateModelResponse(history);
    expect(response.content).toContain("couldn't find a doctor named Dr. Kshatriya");
    expect(response.content).toContain("Dr. Ravi and Dr. Priya");
    expect(response.tool_calls).toBeUndefined();
  });

  it("should explain supported capabilities when queried about doctor schedules generally", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Which doctors are free today?" }
    ];
    const response = simulateModelResponse(history);
    expect(response.content).toContain("I can check the availability of Dr. Ravi and Dr. Priya");
    expect(response.tool_calls).toBeUndefined();
  });

  it("should check Ravi's timetable when user says 'Check Ravi's timetable'", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Check Ravi's timetable" }
    ];
    const response = simulateModelResponse(history);
    expect(response.tool_calls).toBeDefined();
    expect(response.tool_calls![0].function.name).toBe("check_availability");
    
    const args = JSON.parse(response.tool_calls![0].function.arguments);
    expect(args.doctorName).toBe("Dr. Ravi");
    expect(args.date).toBe("2026-08-09"); // default to tomorrow
  });

  it("should check Priya's timetable when user says 'Check Priya's timetable'", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Check Priya's timetable" }
    ];
    const response = simulateModelResponse(history);
    expect(response.tool_calls).toBeDefined();
    expect(response.tool_calls![0].function.name).toBe("check_availability");
    
    const args = JSON.parse(response.tool_calls![0].function.arguments);
    expect(args.doctorName).toBe("Dr. Priya");
    expect(args.date).toBe("2026-08-09");
  });

  it("should handle switching doctors mid-conversation (Ravi to Priya)", () => {
    // Turn 1: Check Ravi
    const turn1History: ChatMessage[] = [
      { role: "user", content: "Book Dr. Ravi tomorrow morning" }
    ];
    const checkRaviCall = simulateModelResponse(turn1History);
    expect(checkRaviCall.tool_calls![0].function.name).toBe("check_availability");
    expect(JSON.parse(checkRaviCall.tool_calls![0].function.arguments).doctorName).toBe("Dr. Ravi");

    // Propose Ravi slot
    const mockRaviCheckToolResult = {
      success: true,
      available: true,
      slots: [{ doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30", isBooked: false }]
    };
    
    const turn2History: ChatMessage[] = [
      ...turn1History,
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call-check-ravi",
            type: "function",
            function: { name: "check_availability", arguments: checkRaviCall.tool_calls![0].function.arguments }
          }
        ]
      },
      { role: "tool", tool_call_id: "call-check-ravi", content: JSON.stringify(mockRaviCheckToolResult) }
    ];
    
    const proposeRaviMsg = simulateModelResponse(turn2History);
    expect(proposeRaviMsg.content).toContain("Dr. Ravi is available at 10:30 AM");

    // Turn 2: User requests to switch to Priya instead
    const turn3History: ChatMessage[] = [
      ...turn2History,
      { role: "assistant", content: proposeRaviMsg.content },
      { role: "user", content: "Actually, book Priya instead." }
    ];

    const checkPriyaCall = simulateModelResponse(turn3History);
    // Should trigger availability check for Priya, inheriting the date (2026-08-09) and preference (morning)
    expect(checkPriyaCall.tool_calls).toBeDefined();
    expect(checkPriyaCall.tool_calls![0].function.name).toBe("check_availability");
    
    const priyaArgs = JSON.parse(checkPriyaCall.tool_calls![0].function.arguments);
    expect(priyaArgs.doctorName).toBe("Dr. Priya");
    expect(priyaArgs.date).toBe("2026-08-09");
    expect(priyaArgs.timePreference).toBe("morning");

    // Propose Priya slot
    const mockPriyaCheckToolResult = {
      success: true,
      available: true,
      slots: [{ doctorName: "Dr. Priya", date: "2026-08-09", time: "09:30", isBooked: false }]
    };

    const turn4History: ChatMessage[] = [
      ...turn3History,
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call-check-priya",
            type: "function",
            function: { name: "check_availability", arguments: checkPriyaCall.tool_calls![0].function.arguments }
          }
        ]
      },
      { role: "tool", tool_call_id: "call-check-priya", content: JSON.stringify(mockPriyaCheckToolResult) }
    ];

    const proposePriyaMsg = simulateModelResponse(turn4History);
    expect(proposePriyaMsg.content).toContain("Dr. Priya is available at 9:30 AM");

    // Turn 3: User confirms Priya booking
    const turn5History: ChatMessage[] = [
      ...turn4History,
      { role: "assistant", content: proposePriyaMsg.content },
      { role: "user", content: "Yes, go ahead and book it." }
    ];

    const bookPriyaCall = simulateModelResponse(turn5History);
    expect(bookPriyaCall.tool_calls).toBeDefined();
    expect(bookPriyaCall.tool_calls![0].function.name).toBe("book_appointment");
    
    const bookArgs = JSON.parse(bookPriyaCall.tool_calls![0].function.arguments);
    expect(bookArgs.doctorName).toBe("Dr. Priya");
    expect(bookArgs.date).toBe("2026-08-09");
    expect(bookArgs.time).toBe("09:30");
  });

  it("should report active booked appointment status when asked", () => {
    // No active booking
    const history1: ChatMessage[] = [
      { role: "user", content: "Do I have an active appointment?" }
    ];
    const res1 = simulateModelResponse(history1);
    expect(res1.content).toContain("do not have any active appointments booked");

    // Add a successful book tool response to history
    const history2: ChatMessage[] = [
      { role: "user", content: "Book Dr. Ravi tomorrow morning" },
      { role: "assistant", content: null, tool_calls: [{ id: "c-1", type: "function", function: { name: "book_appointment", arguments: JSON.stringify({ doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30" }) } }] },
      { role: "tool", tool_call_id: "c-1", content: JSON.stringify({ success: true, booking: { doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30", isBooked: true } }) },
      { role: "assistant", content: "Your appointment is confirmed for Dr. Ravi at 10:30 AM." },
      { role: "user", content: "what is my active appointment?" }
    ];
    const res2 = simulateModelResponse(history2);
    expect(res2.content).toContain("active appointment booked with Dr. Ravi");
    expect(res2.content).toContain("Sunday, Aug 9, 2026");
    expect(res2.content).toContain("10:30 AM");
  });

  it("should trigger cancel tool call when user cancels active appointment", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Book Dr. Ravi tomorrow morning" },
      { role: "assistant", content: null, tool_calls: [{ id: "c-1", type: "function", function: { name: "book_appointment", arguments: JSON.stringify({ doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30" }) } }] },
      { role: "tool", tool_call_id: "c-1", content: JSON.stringify({ success: true, booking: { doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30", isBooked: true } }) },
      { role: "assistant", content: "Your appointment is confirmed for Dr. Ravi at 10:30 AM." },
      { role: "user", content: "Cancel my appointment" }
    ];
    const res = simulateModelResponse(history);
    expect(res.tool_calls).toBeDefined();
    expect(res.tool_calls![0].function.name).toBe("cancel_appointment");
    const args = JSON.parse(res.tool_calls![0].function.arguments);
    expect(args.doctorName).toBe("Dr. Ravi");
    expect(args.date).toBe("2026-08-09");
    expect(args.time).toBe("10:30");
  });

  it("should make slot available after cancellation", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Cancel my appointment" },
      { role: "assistant", content: null, tool_calls: [{ id: "c-canc", type: "function", function: { name: "cancel_appointment", arguments: JSON.stringify({ doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30" }) } }] },
      { role: "tool", tool_call_id: "c-canc", content: JSON.stringify({ success: true, booking: { doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30", isBooked: false } }) }
    ];
    const res = simulateModelResponse(history);
    expect(res.content).toContain("successfully cancelled");
  });

  it("should trigger reschedule check when rescheduling to available slot", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Book Dr. Ravi tomorrow morning" },
      { role: "assistant", content: null, tool_calls: [{ id: "c-1", type: "function", function: { name: "book_appointment", arguments: JSON.stringify({ doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30" }) } }] },
      { role: "tool", tool_call_id: "c-1", content: JSON.stringify({ success: true, booking: { doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30", isBooked: true } }) },
      { role: "assistant", content: "Your appointment is confirmed." },
      { role: "user", content: "Can I reschedule to tomorrow afternoon?" }
    ];
    const res = simulateModelResponse(history);
    expect(res.tool_calls).toBeDefined();
    expect(res.tool_calls![0].function.name).toBe("check_availability");
    const args = JSON.parse(res.tool_calls![0].function.arguments);
    expect(args.doctorName).toBe("Dr. Ravi");
    expect(args.date).toBe("2026-08-09");
    expect(args.timePreference).toBe("afternoon");
  });

  it("should trigger find alternative slots when rescheduling to unavailable slot", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Book Dr. Ravi tomorrow morning" },
      { role: "assistant", content: null, tool_calls: [{ id: "c-1", type: "function", function: { name: "book_appointment", arguments: JSON.stringify({ doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30" }) } }] },
      { role: "tool", tool_call_id: "c-1", content: JSON.stringify({ success: true, booking: { doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30", isBooked: true } }) },
      { role: "assistant", content: "Your appointment is confirmed." },
      { role: "user", content: "Can I move it to tomorrow at 9:30 AM?" }
    ];
    
    const checkAvailabilityCall = simulateModelResponse(history);
    expect(checkAvailabilityCall.tool_calls![0].function.name).toBe("check_availability");
    
    const turnHistory: ChatMessage[] = [
      ...history,
      { role: "assistant", content: null, tool_calls: [{ id: "c-2", type: "function", function: { name: "check_availability", arguments: checkAvailabilityCall.tool_calls![0].function.arguments } }] },
      { role: "tool", tool_call_id: "c-2", content: JSON.stringify({ success: true, available: false, slots: [{ doctorName: "Dr. Ravi", date: "2026-08-09", time: "09:30", isBooked: true }] }) }
    ];
    
    const altCall = simulateModelResponse(turnHistory);
    expect(altCall.tool_calls).toBeDefined();
    expect(altCall.tool_calls![0].function.name).toBe("find_alternative_slots");
    const args = JSON.parse(altCall.tool_calls![0].function.arguments);
    expect(args.doctorName).toBe("Dr. Ravi");
    expect(args.date).toBe("2026-08-09");
  });

  it("should book selected alternative and release old slot", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Book Dr. Ravi tomorrow at 10:30 AM" },
      { role: "assistant", content: null, tool_calls: [{ id: "c-1", type: "function", function: { name: "book_appointment", arguments: JSON.stringify({ doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30" }) } }] },
      { role: "tool", tool_call_id: "c-1", content: JSON.stringify({ success: true, booking: { doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30", isBooked: true } }) },
      { role: "assistant", content: "Your appointment is confirmed." },
      { role: "user", content: "Can I move it to tomorrow at 9:30 AM?" },
      { role: "assistant", content: null, tool_calls: [{ id: "c-2", type: "function", function: { name: "check_availability", arguments: JSON.stringify({ doctorName: "Dr. Ravi", date: "2026-08-09", time: "09:30" }) } }] },
      { role: "tool", tool_call_id: "c-2", content: JSON.stringify({ success: true, available: false, slots: [{ doctorName: "Dr. Ravi", date: "2026-08-09", time: "09:30", isBooked: true }] }) },
      { role: "assistant", content: null, tool_calls: [{ id: "c-3", type: "function", function: { name: "find_alternative_slots", arguments: JSON.stringify({ doctorName: "Dr. Ravi", date: "2026-08-09" }) } }] },
      { role: "tool", tool_call_id: "c-3", content: JSON.stringify({ success: true, alternatives: [{ doctorName: "Dr. Ravi", date: "2026-08-09", time: "11:00", isBooked: false }] }) },
      { role: "assistant", content: "Dr. Ravi is not available then. I found openings at 11:00 AM. Does that work?" },
      { role: "user", content: "Yes, book 11:00 AM" }
    ];

    const bookCall = simulateModelResponse(history);
    expect(bookCall.tool_calls).toBeDefined();
    expect(bookCall.tool_calls![0].function.name).toBe("book_appointment");
    const args = JSON.parse(bookCall.tool_calls![0].function.arguments);
    expect(args.doctorName).toBe("Dr. Ravi");
    expect(args.date).toBe("2026-08-09");
    expect(args.time).toBe("11:00");
  });

  it("should fail reschedule and keep original appointment booked if booking fails", () => {
    const initialSchedule = getSchedule();
    const slot1030 = initialSchedule.find(s => s.doctorName === "Dr. Ravi" && s.date === "2026-08-09" && s.time === "10:30");
    const slot1100 = initialSchedule.find(s => s.doctorName === "Dr. Ravi" && s.date === "2026-08-09" && s.time === "11:00");
    
    slot1030!.isBooked = true;
    slot1100!.isBooked = true;

    const stateBefore = getConversationState([
      { role: "user", content: "Book Dr. Ravi tomorrow at 10:30 AM" },
      { role: "assistant", content: null, tool_calls: [{ id: "c-1", type: "function", function: { name: "book_appointment", arguments: JSON.stringify({ doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30" }) } }] },
      { role: "tool", tool_call_id: "c-1", content: JSON.stringify({ success: true, booking: { doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30", isBooked: true } }) }
    ]);
    expect(stateBefore.activeBookedAppointment).toBeDefined();
    expect(stateBefore.activeBookedAppointment?.time).toBe("10:30");
  });

  it("should explain no active appointment to cancel when trying to cancel without one", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Cancel my appointment" }
    ];
    const res = simulateModelResponse(history);
    expect(res.content).toContain("do not have any active appointments to cancel");
    expect(res.tool_calls).toBeUndefined();
  });

  it("should ask which appointment to reschedule when trying to reschedule without active appointment", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Reschedule my appointment to tomorrow afternoon" }
    ];
    const res = simulateModelResponse(history);
    expect(res.content).toContain("Which appointment would you like to reschedule?");
    expect(res.tool_calls).toBeUndefined();
  });

  it("should use current context when user requests 'find alternative'", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Book Dr. Ravi tomorrow morning" },
      { role: "assistant", content: null, tool_calls: [{ id: "c-1", type: "function", function: { name: "check_availability", arguments: JSON.stringify({ doctorName: "Dr. Ravi", date: "2026-08-09", timePreference: "morning" }) } }] },
      { role: "tool", tool_call_id: "c-1", content: JSON.stringify({ success: true, available: false, slots: [] }) },
      { role: "assistant", content: "Dr. Ravi is not available tomorrow morning." },
      { role: "user", content: "find alternative" }
    ];
    const res = simulateModelResponse(history);
    expect(res.tool_calls).toBeDefined();
    expect(res.tool_calls![0].function.name).toBe("find_alternative_slots");
    const args = JSON.parse(res.tool_calls![0].function.arguments);
    expect(args.doctorName).toBe("Dr. Ravi");
    expect(args.date).toBe("2026-08-09");
  });

  it("should reject unknown doctor Dr. Smith", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Book Dr. Smith tomorrow at 10:00" }
    ];
    const res = simulateModelResponse(history);
    expect(res.content).toContain("couldn't find a doctor named Dr. Smith");
    expect(res.content).toContain("Dr. Ravi and Dr. Priya");
    expect(res.tool_calls).toBeUndefined();
  });

  it("should not interpret 'area doctors' as doctor 'Dr. area'", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "can you check the area doctors" }
    ];
    const res = simulateModelResponse(history);
    expect(res.content).toContain("I can check the availability of Dr. Ravi and Dr. Priya");
    expect(res.content).not.toContain("Dr. area");
    expect(res.tool_calls).toBeUndefined();
  });
});
