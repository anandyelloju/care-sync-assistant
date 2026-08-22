import { getOpenRouterClient } from "./aiService";
import {
  checkAvailability,
  findAlternativeSlots,
  bookAppointment,
  cancelAppointment
} from "./appointmentEngine";
import { DoctorSlot, TimePreference } from "../types/appointment";

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }[];
}

// Controlled AI tools schemas
export const agentTools = [
  {
    type: "function" as const,
    function: {
      name: "check_availability",
      description: "Check the availability of doctor slots based on exact time or a general morning/afternoon/evening preference.",
      parameters: {
        type: "object",
        properties: {
          doctorName: {
            type: "string",
            description: "The name of the doctor (e.g. 'Dr. Ravi', 'Dr. Priya')."
          },
          date: {
            type: "string",
            description: "The date of the appointment in YYYY-MM-DD format."
          },
          time: {
            type: "string",
            description: "The exact time in HH:MM format (optional)."
          },
          timePreference: {
            type: "string",
            enum: ["morning", "afternoon", "evening"],
            description: "The general time preference (optional, morning: 08:00-11:59, afternoon: 12:00-16:59, evening: 17:00-20:59)."
          }
        },
        required: ["doctorName", "date"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "find_alternative_slots",
      description: "Suggest up to 3 alternative available slots when a requested slot is unavailable.",
      parameters: {
        type: "object",
        properties: {
          doctorName: {
            type: "string",
            description: "The name of the doctor (e.g. 'Dr. Ravi', 'Dr. Priya')."
          },
          date: {
            type: "string",
            description: "The date of the appointment in YYYY-MM-DD format."
          },
          time: {
            type: "string",
            description: "The exact time in HH:MM format around which to look for alternatives (optional)."
          },
          timePreference: {
            type: "string",
            enum: ["morning", "afternoon", "evening"],
            description: "The general time preference around which to look for alternatives (optional)."
          }
        },
        required: ["doctorName", "date"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "book_appointment",
      description: "Book an appointment slot. This function actually performs the scheduling and mutates database status. Only call this tool AFTER the user has explicitly confirmed a specific proposed slot.",
      parameters: {
        type: "object",
        properties: {
          doctorName: {
            type: "string",
            description: "The name of the doctor (e.g. 'Dr. Ravi', 'Dr. Priya')."
          },
          date: {
            type: "string",
            description: "The date of the appointment in YYYY-MM-DD format."
          },
          time: {
            type: "string",
            description: "The exact time to book in HH:MM format."
          }
        },
        required: ["doctorName", "date", "time"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "cancel_appointment",
      description: "Cancel an existing booked appointment slot. Only call this tool when the user explicitly requests to cancel their appointment.",
      parameters: {
        type: "object",
        properties: {
          doctorName: {
            type: "string",
            description: "The name of the doctor (e.g. 'Dr. Ravi', 'Dr. Priya')."
          },
          date: {
            type: "string",
            description: "The date of the appointment in YYYY-MM-DD format."
          },
          time: {
            type: "string",
            description: "The exact time to cancel in HH:MM format."
          }
        },
        required: ["doctorName", "date", "time"],
        additionalProperties: false
      }
    }
  }
];

interface MockChoiceMessage {
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }[];
}

export interface ConversationState {
  selectedDoctor: string | null;
  requestedDate: string | null;
  requestedTime: string | null;
  requestedTimePreference: TimePreference | null;
  activeBookedAppointment: DoctorSlot | null;
  currentIntent:
    | "book"
    | "check_availability"
    | "reschedule"
    | "cancel"
    | "find_alternative"
    | "confirm"
    | "rejection"
    | "general"
    | null;
}

/**
 * Helper to build the conversation state by processing messages.
 */
export function getConversationState(messages: ChatMessage[]): ConversationState {
  let selectedDoctor: string | null = null;
  let requestedDate: string | null = null;
  let requestedTime: string | null = null;
  let requestedTimePreference: TimePreference | null = null;
  let activeBookedAppointment: DoctorSlot | null = null;
  let currentIntent: ConversationState["currentIntent"] = null;

  // 1. Scan tool responses sequentially to find the currently active booking
  for (const m of messages) {
    if (m.role === "tool" && m.content) {
      try {
        const res = JSON.parse(m.content);
        if (res.success) {
          if (res.booking) {
            if (res.booking.isBooked) {
              activeBookedAppointment = res.booking;
              selectedDoctor = res.booking.doctorName;
              requestedDate = res.booking.date;
              requestedTime = res.booking.time;
              requestedTimePreference = null;
            } else {
              // Cancelled
              if (
                activeBookedAppointment &&
                activeBookedAppointment.doctorName.toLowerCase() === res.booking.doctorName.toLowerCase() &&
                activeBookedAppointment.date === res.booking.date &&
                activeBookedAppointment.time === res.booking.time
              ) {
                activeBookedAppointment = null;
              }
            }
          } else if (res.cancelled && res.booking) {
            if (
              activeBookedAppointment &&
              activeBookedAppointment.doctorName.toLowerCase() === res.booking.doctorName.toLowerCase() &&
              activeBookedAppointment.date === res.booking.date &&
              activeBookedAppointment.time === res.booking.time
            ) {
              activeBookedAppointment = null;
            }
          }
        }
      } catch {
        // Ignore JSON parse errors
      }
    }
  }

  // 2. Scan user turns from start to finish to build context and intents
  for (const m of messages) {
    if (m.role === "user" && m.content) {
      const text = m.content.toLowerCase();

      // Check intent
      if (text.includes("cancel")) {
        currentIntent = "cancel";
      } else if (
        text.includes("reschedule") ||
        text.includes("change") ||
        text.includes("move") ||
        text.includes("postpone") ||
        text.includes("timing")
      ) {
        currentIntent = "reschedule";
      } else if (
        text.includes("alternative") ||
        text.includes("other slots") ||
        text.includes("different time") ||
        text.includes("other opening")
      ) {
        currentIntent = "find_alternative";
      } else if (
        text.includes("yes") ||
        text.includes("confirm") ||
        text.includes("go ahead") ||
        text.includes("please book") ||
        text.includes("that works") ||
        text.includes("perfect")
      ) {
        currentIntent = "confirm";
      } else if (
        text.includes("no") ||
        text.includes("reject") ||
        text.includes("change request") ||
        text.includes("don't book") ||
        text.includes("do not book")
      ) {
        currentIntent = "rejection";
      } else if (text.includes("book") || text.includes("reserve")) {
        currentIntent = "book";
      } else if (
        text.includes("timetable") ||
        text.includes("available") ||
        text.includes("free") ||
        text.includes("calendar") ||
        text.includes("schedule") ||
        text.includes("check")
      ) {
        currentIntent = "check_availability";
      } else {
        currentIntent = "general";
      }

      // Check doctor
      if (text.includes("ravi")) {
        selectedDoctor = "Dr. Ravi";
      } else if (text.includes("priya")) {
        selectedDoctor = "Dr. Priya";
      }

      // Check date
      if (text.includes("today")) {
        requestedDate = "2026-08-08";
      } else if (text.includes("tomorrow")) {
        requestedDate = "2026-08-09";
      } else if (text.includes("monday") || text.includes("next monday")) {
        requestedDate = "2026-08-10";
      } else {
        const dateMatch = text.match(/\d{4}-\d{2}-\d{2}/);
        if (dateMatch) {
          requestedDate = dateMatch[0];
        }
      }

      // Check time
      const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        let hh = timeMatch[1];
        const mm = timeMatch[2];
        if (hh.length === 1) hh = "0" + hh;
        requestedTime = `${hh}:${mm}`;
        requestedTimePreference = null;
      }

      if (text.includes("morning")) {
        requestedTimePreference = "morning";
        requestedTime = null;
      } else if (text.includes("afternoon")) {
        requestedTimePreference = "afternoon";
        requestedTime = null;
      } else if (text.includes("evening")) {
        requestedTimePreference = "evening";
        requestedTime = null;
      }
    }
  }

  // Inherit doctor context from active appointment if not explicitly overridden
  if (!selectedDoctor && activeBookedAppointment) {
    selectedDoctor = activeBookedAppointment.doctorName;
  }

  return {
    selectedDoctor,
    requestedDate,
    requestedTime,
    requestedTimePreference,
    activeBookedAppointment,
    currentIntent,
  };
}

interface MockChoiceMessage {
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }[];
}

/**
 * Generates local simulated model completion responses when no API key is set.
 */
export function simulateModelResponse(history: ChatMessage[]): MockChoiceMessage {
  const lastMsg = history[history.length - 1];
  
  if (!lastMsg) {
    return {
      content: "I'm CareSync's AI assistant. To book an appointment, try using one of the helper prompts on the right, like \"Book Dr. Ravi\".",
    };
  }

  const formatTime = (timeStr: string) => {
    try {
      const [h, m] = timeStr.split(":").map(Number);
      const ampm = h >= 12 ? "PM" : "AM";
      const hour12 = h % 12 || 12;
      const minStr = m < 10 ? `0${m}` : m;
      return `${hour12}:${minStr} ${ampm}`;
    } catch {
      return timeStr;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr + "T00:00:00");
      return date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const state = getConversationState(history);

  // 1. Handle tool responses
  if (lastMsg.role === "tool") {
    const callId = lastMsg.tool_call_id;
    interface MockToolResult {
      success?: boolean;
      available?: boolean;
      slots?: DoctorSlot[];
      alternatives?: DoctorSlot[];
      booking?: DoctorSlot;
      error?: string;
    }
    let toolResult: MockToolResult = {};
    try {
      toolResult = JSON.parse(lastMsg.content || "{}");
    } catch {
      // Ignore
    }

    const assistantMsg = [...history].reverse().find(
      (m) => m.role === "assistant" && m.tool_calls?.some((tc) => tc.id === callId)
    );
    const toolCall = assistantMsg?.tool_calls?.find((tc) => tc.id === callId);
    if (!toolCall) {
      return {
        content: "I'm CareSync's AI assistant. How can I help you?",
      };
    }
    const functionName = toolCall.function.name;

    if (functionName === "check_availability") {
      const args = JSON.parse(toolCall.function.arguments);
      const docName = args.doctorName;
      if (toolResult.success) {
        if (toolResult.available && toolResult.slots && toolResult.slots.length > 0) {
          const slot = toolResult.slots.find((s: DoctorSlot) => !s.isBooked) || toolResult.slots[0];
          return {
            content: `${docName} is available at ${formatTime(slot.time)} on ${formatDate(slot.date)}. Would you like me to book it?`,
          };
        } else {
          // If checking availability for reschedule and unavailable, call find alternatives
          return {
            content: null,
            tool_calls: [
              {
                id: `mock-alt-${docName.toLowerCase().replace("dr. ", "")}`,
                type: "function",
                function: {
                  name: "find_alternative_slots",
                  arguments: JSON.stringify({
                    doctorName: docName,
                    date: args.date,
                    time: args.time,
                    timePreference: args.timePreference
                  }),
                },
              },
            ],
          };
        }
      } else {
        return {
          content: `I'm sorry, I couldn't check availability: ${toolResult.error || "Doctor not found"}.`,
        };
      }
    }

    if (functionName === "find_alternative_slots") {
      const args = JSON.parse(toolCall.function.arguments);
      const docName = args.doctorName;
      if (toolResult.success && toolResult.alternatives && toolResult.alternatives.length > 0) {
        const alts = toolResult.alternatives.slice(0, 3);
        const slotsStr = alts.map((s: DoctorSlot) => `${formatTime(s.time)}`).join(" or ");
        const dateStr = formatDate(alts[0].date);
        return {
          content: `${docName} is not available then. However, I found openings on ${dateStr} at ${slotsStr}. Do any of those work?`,
        };
      } else {
        return {
          content: `I couldn't find any alternative slots for ${docName} on ${formatDate(args.date)}.`,
        };
      }
    }

    if (functionName === "book_appointment") {
      if (toolResult.success && toolResult.booking) {
        const b = toolResult.booking;
        return {
          content: `Your appointment with ${b.doctorName} is confirmed for ${formatTime(b.time)} on ${formatDate(b.date)}.`,
        };
      } else {
        return {
          content: `I couldn't complete the booking: ${toolResult.error || "The requested slot is not available."}`,
        };
      }
    }

    if (functionName === "cancel_appointment") {
      if (toolResult.success && toolResult.booking) {
        const b = toolResult.booking;
        return {
          content: `Your appointment with ${b.doctorName} on ${formatDate(b.date)} at ${formatTime(b.time)} has been successfully cancelled.`,
        };
      } else {
        return {
          content: `I couldn't cancel the appointment: ${toolResult.error || "Appointment not found."}`,
        };
      }
    }

    return {
      content: "I'm CareSync's AI assistant. How can I help you?",
    };
  }

  // 2. Handle user messages
  if (lastMsg.role === "user") {
    const text = (lastMsg.content || "").toLowerCase();

    // Check for invalid doctor names (like Dr. Kshatriya)
    const generalKeywords = [
      "area", "doctors", "available", "free", "any", "which", "who", "timetable", "schedule"
    ];
    let mentionDoc = lastMsg.content?.match(/(?:dr\.?\s+|doctor\s+)([a-zA-Z]+)/i);
    if (!mentionDoc) {
      mentionDoc = lastMsg.content?.match(/([a-zA-Z]+)\s+(?:doctor|dr)/i);
    }
    if (mentionDoc) {
      const parsedName = mentionDoc[1].toLowerCase();
      if (parsedName !== "ravi" && parsedName !== "priya" && !generalKeywords.includes(parsedName) &&
          !["book", "check", "find", "tomorrow", "today", "monday", "timing"].includes(parsedName)) {
        return {
          content: `I'm sorry, I couldn't find a doctor named Dr. ${mentionDoc[1]}. Our available doctors are Dr. Ravi and Dr. Priya.`,
        };
      }
    }

    // Check for general supported capabilities queries
    if (text.includes("which doctors") || text.includes("who is free") || text.includes("are free today") ||
        text.includes("available doctors") || text.includes("area doctors")) {
      return {
        content: "I can check the availability of Dr. Ravi and Dr. Priya. Please ask about a specific doctor (e.g., 'Check Dr. Ravi's timetable') or request to book one of them directly.",
      };
    }

    // Handle Active Appointment Check
    if (text.includes("active appointment") || text.includes("my appointment") && (text.includes("check") || text.includes("what is") || text.includes("do i have"))) {
      if (state.activeBookedAppointment) {
        const b = state.activeBookedAppointment;
        return {
          content: `You have an active appointment booked with ${b.doctorName} on ${formatDate(b.date)} at ${formatTime(b.time)}.`,
        };
      } else {
        return {
          content: "You do not have any active appointments booked.",
        };
      }
    }

    // Handle Cancellation Request
    if (state.currentIntent === "cancel") {
      if (state.activeBookedAppointment) {
        const b = state.activeBookedAppointment;
        return {
          content: null,
          tool_calls: [
            {
              id: `mock-cancel-${b.doctorName.toLowerCase().replace("dr. ", "")}`,
              type: "function",
              function: {
                name: "cancel_appointment",
                arguments: JSON.stringify({ doctorName: b.doctorName, date: b.date, time: b.time }),
              },
            },
          ],
        };
      } else {
        return {
          content: "You do not have any active appointments to cancel.",
        };
      }
    }

    // Handle Rescheduling Request
    if (state.currentIntent === "reschedule") {
      if (!state.activeBookedAppointment) {
        return {
          content: "Which appointment would you like to reschedule? Please specify the doctor or the appointment details.",
        };
      }

      // If we don't have new details, ask for them
      const hasNewDate = text.includes("today") || text.includes("tomorrow") || text.includes("monday") || text.includes("next monday") || /\d{4}-\d{2}-\d{2}/.test(text);
      const hasNewTime = /(\d{1,2}):(\d{2})/.test(text) || text.includes("morning") || text.includes("afternoon") || text.includes("evening");

      if (!hasNewDate && !hasNewTime) {
        return {
          content: `For which date and time would you like to reschedule your appointment with ${state.selectedDoctor}?`,
        };
      }

      const docName = state.selectedDoctor || state.activeBookedAppointment.doctorName;
      const date = state.requestedDate || state.activeBookedAppointment.date;
      return {
        content: null,
        tool_calls: [
          {
            id: `mock-check-${docName.toLowerCase().replace("dr. ", "")}`,
            type: "function",
            function: {
              name: "check_availability",
              arguments: JSON.stringify({
                doctorName: docName,
                date,
                ...(state.requestedTime ? { time: state.requestedTime } : {}),
                ...(state.requestedTimePreference ? { timePreference: state.requestedTimePreference } : {}),
              }),
            },
          },
        ],
      };
    }

    // Handle Find Alternative Slots Request
    if (state.currentIntent === "find_alternative") {
      const docName = state.selectedDoctor;
      const date = state.requestedDate || "2026-08-09";
      if (!docName) {
        return {
          content: "Which doctor would you like to find alternatives for? Dr. Ravi or Dr. Priya?",
        };
      }
      return {
        content: null,
        tool_calls: [
          {
            id: `mock-alt-${docName.toLowerCase().replace("dr. ", "")}`,
            type: "function",
            function: {
              name: "find_alternative_slots",
              arguments: JSON.stringify({
                doctorName: docName,
                date,
                ...(state.requestedTime ? { time: state.requestedTime } : {}),
                ...(state.requestedTimePreference ? { timePreference: state.requestedTimePreference } : {}),
              }),
            },
          },
        ],
      };
    }

    // Handle Confirmation Request
    if (state.currentIntent === "confirm") {
      if (state.selectedDoctor) {
        let date = "";
        let time = "";
        
        const lastToolCall = [...history].reverse().find(
          (m) => m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0
        );
        
        if (lastToolCall && lastToolCall.tool_calls) {
          const tc = lastToolCall.tool_calls[0];
          const args = JSON.parse(tc.function.arguments);
          
          if (tc.function.name === "check_availability") {
            date = args.date;
            const toolMsg = history.find(m => m.role === "tool" && m.tool_call_id === tc.id);
            if (toolMsg && toolMsg.content) {
              const res = JSON.parse(toolMsg.content);
              if (res.success && res.slots && res.slots.length > 0) {
                const availSlot = res.slots.find((s: DoctorSlot) => !s.isBooked) || res.slots[0];
                time = availSlot.time;
              }
            }
            if (!time) time = args.time;
          } else if (tc.function.name === "find_alternative_slots") {
            date = args.date;
            const toolMsg = history.find(m => m.role === "tool" && m.tool_call_id === tc.id);
            if (toolMsg && toolMsg.content) {
              const res = JSON.parse(toolMsg.content);
              if (res.success && res.alternatives && res.alternatives.length > 0) {
                time = res.alternatives[0].time;
              }
            }
          }
        }

        if (!time) {
          const lastProposal = [...history].reverse().find(
            (m) => m.role === "assistant" && m.content !== null && (m.content.includes("available at") || m.content.includes("openings on") || m.content.includes("opening at"))
          );
          if (lastProposal && lastProposal.content) {
            const timeMatch = lastProposal.content.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (timeMatch) {
              let hh = parseInt(timeMatch[1]);
              const mm = timeMatch[2];
              const ampm = timeMatch[3].toUpperCase();
              if (ampm === "PM" && hh < 12) hh += 12;
              if (ampm === "AM" && hh === 12) hh = 0;
              const hhStr = hh < 10 ? `0${hh}` : `${hh}`;
              time = `${hhStr}:${mm}`;
            }
            const hhmmMatch = lastProposal.content.match(/(\d{2}):(\d{2})/);
            if (!time && hhmmMatch) {
              time = `${hhmmMatch[1]}:${hhmmMatch[2]}`;
            }
            const dateMatch = lastProposal.content.match(/\d{4}-\d{2}-\d{2}/);
            if (dateMatch) {
              date = dateMatch[0];
            }
          }
        }

        if (!date) {
          date = state.requestedDate || "2026-08-09";
        }

        if (date && time) {
          return {
            content: null,
            tool_calls: [
              {
                id: `mock-book-${state.selectedDoctor.toLowerCase().replace("dr. ", "")}`,
                type: "function",
                function: {
                  name: "book_appointment",
                  arguments: JSON.stringify({ doctorName: state.selectedDoctor, date, time }),
                },
              },
            ],
          };
        }
      }
    }

    // Default Flow / Timetable or check availability request
    if (!state.selectedDoctor) {
      return {
        content: "Which doctor would you like to see? Dr. Ravi or Dr. Priya?",
      };
    }

    const date = state.requestedDate || "2026-08-09";
    
    if (!state.requestedDate || (!state.requestedTime && !state.requestedTimePreference)) {
      if (text.includes("book") || text.includes("reserve") || text.includes("appointment")) {
        return {
          content: `For which date and time would you like to book ${state.selectedDoctor}?`,
        };
      }
    }

    return {
      content: null,
      tool_calls: [
        {
          id: `mock-check-${state.selectedDoctor.toLowerCase().replace("dr. ", "")}`,
          type: "function",
          function: {
            name: "check_availability",
            arguments: JSON.stringify({
              doctorName: state.selectedDoctor,
              date,
              ...(state.requestedTime ? { time: state.requestedTime } : {}),
              ...(state.requestedTimePreference ? { timePreference: state.requestedTimePreference } : {}),
            }),
          },
        },
      ],
    };
  }

  return {
    content: "I'm CareSync's AI assistant. To book an appointment, try using one of the helper prompts on the right, like \"Book Dr. Ravi\".",
  };
}

/**
 * Runs the conversational agent loop with tool-calling capabilities.
 * Resolves tool calls using the deterministic Appointment Engine.
 * 
 * @param messages The chat history.
 * @param currentDateStr Current date override context (YYYY-MM-DD).
 */
export async function runAgentConversation(
  messages: ChatMessage[],
  currentDateStr?: string
): Promise<ChatMessage[]> {
  const client = getOpenRouterClient();
  const referenceDate = currentDateStr || new Date().toISOString().split("T")[0];
  
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = daysOfWeek[new Date(referenceDate).getDay()];
  
  const history = [...messages];
  
  // Construct instructions and insert the system prompt if not present
  const state = getConversationState(history);
  const hasSystemMessage = history.some((m) => m.role === "system");
  if (!hasSystemMessage) {
    const systemPrompt = `You are CareSync's AI assistant, a helpful and precise healthcare appointment scheduler.
Your job is to assist patients in checking availability, finding alternative slots, booking, rescheduling, and cancelling appointments with our doctors (Dr. Ravi and Dr. Priya).

Current date context:
- The current date is: ${referenceDate} (which is a ${dayName}).
- Always resolve relative expressions like "tomorrow", "next Monday" to their exact absolute dates in YYYY-MM-DD format before passing them to any tool.

Current Conversation State:
- Selected doctor: ${state.selectedDoctor || "None"}
- Requested date: ${state.requestedDate || "None"}
- Requested time: ${state.requestedTime || "None"}
- Time preference: ${state.requestedTimePreference || "None"}
- Active booked appointment: ${state.activeBookedAppointment ? `${state.activeBookedAppointment.doctorName} on ${state.activeBookedAppointment.date} at ${state.activeBookedAppointment.time}` : "None"}

Guidelines for conversation flow:
1. CHECK AVAILABILITY: When a user asks for an appointment, use the 'check_availability' tool first.
2. DISCUSSING SLOTS:
   - If 'check_availability' returns an available slot, present the slot details (doctor, date, time) to the user and ASK for their explicit confirmation (e.g., "Dr. Ravi has an opening at 10:30 AM tomorrow. Would you like me to book it?").
   - If 'check_availability' indicates the slot is unavailable, or if the user asks for other slots, call 'find_alternative_slots' immediately. Offer the returned alternatives to the user (e.g., "Dr. Ravi isn't available at 10:00 AM. I can offer 11:00 AM or 2:00 PM. Which works for you?").
3. CONFIRMATION REQUIRED:
   - DO NOT call the 'book_appointment' tool until the user has explicitly confirmed the specific slot you proposed.
4. RESCHEDULING:
   - If the user requests to reschedule/change their timing, and an active appointment is booked, use it as starting context (the doctor is inherited). Check availability for the new slot first.
   - Do NOT cancel the old slot beforehand. The system will release the old slot automatically when the new slot is successfully booked.
   - If they request rescheduling but have no active appointment, ask which appointment they mean.
5. CANCELLATION:
   - If the user requests to cancel their appointment (e.g. "Cancel my appointment"), check if they have an active booked appointment.
   - If yes, use the 'cancel_appointment' tool to release the slot.
   - If no active appointment is booked, politely let them know that they do not have any active appointments to cancel.
6. DOCTOR VALIDATION:
   - Our known doctors are Dr. Ravi and Dr. Priya.
   - Never convert arbitrary words (like "area", "doctors", "available") into doctor names.
   - If an unknown doctor is requested (e.g., "Dr. Smith"), clearly reject it.
7. GENERAL CAPABILITIES:
   - If the user asks unsupported general questions like "Who are the doctors?", respond helpfully about our doctors (Dr. Ravi and Dr. Priya) and scheduling capabilities.`;

    history.unshift({ role: "system", content: systemPrompt });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const isMock =
    process.env.NODE_ENV !== "test" &&
    (!apiKey || apiKey === "your_openrouter_api_key_here" || apiKey === "mock-key");

  let loopCount = 0;
  const maxLoops = 5;

  while (loopCount < maxLoops) {
    loopCount++;
    
    let choiceMessage: MockChoiceMessage;

    if (isMock) {
      // Offline fallback simulation
      choiceMessage = simulateModelResponse(history);
    } else {
      // Fetch response from OpenRouter API
      const response = await client.chat.completions.create({
        model: "x-ai/grok-2",
        messages: history as unknown as Parameters<typeof client.chat.completions.create>[0]["messages"],
        tools: agentTools,
        temperature: 0
      });

      const msg = response.choices[0]?.message;
      if (!msg) {
        throw new Error("No message returned from AI completions.");
      }

      choiceMessage = {
        content: msg.content || null,
        tool_calls: msg.tool_calls
          ? msg.tool_calls.map((tc) => {
              const funcCall = tc as {
                id: string;
                type: "function";
                function: { name: string; arguments: string };
              };
              return {
                id: funcCall.id,
                type: "function" as const,
                function: {
                  name: funcCall.function.name,
                  arguments: funcCall.function.arguments
                }
              };
            })
          : undefined
      };
    }

    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: choiceMessage.content,
      tool_calls: choiceMessage.tool_calls
    };

    history.push(assistantMessage);

    if (!choiceMessage.tool_calls || choiceMessage.tool_calls.length === 0) {
      // Loop ends when model generates text response
      return history;
    }

    // Process tool calls
    for (const toolCall of choiceMessage.tool_calls) {
      const funcCall = toolCall as {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      };
      let toolResult: unknown;
      const functionName = funcCall.function.name;
      
      try {
        const args = JSON.parse(funcCall.function.arguments);
        
        if (functionName === "check_availability") {
          const res = checkAvailability({
            doctorName: args.doctorName,
            date: args.date,
            time: args.time || undefined,
            timePreference: args.timePreference || undefined
          });
          toolResult = { success: true, ...res };
        } else if (functionName === "find_alternative_slots") {
          const res = findAlternativeSlots({
            doctorName: args.doctorName,
            date: args.date,
            time: args.time || undefined,
            timePreference: args.timePreference || undefined
          });
          toolResult = { success: true, alternatives: res };
        } else if (functionName === "book_appointment") {
          const stateBefore = getConversationState(history);
          const activeAppt = stateBefore.activeBookedAppointment;

          const res = bookAppointment({
            doctorName: args.doctorName,
            date: args.date,
            time: args.time
          });

          if (res.success && activeAppt) {
            const isDifferent =
              activeAppt.doctorName.toLowerCase() !== args.doctorName.toLowerCase() ||
              activeAppt.date !== args.date ||
              activeAppt.time !== args.time;
            
            if (isDifferent) {
              cancelAppointment({
                doctorName: activeAppt.doctorName,
                date: activeAppt.date,
                time: activeAppt.time
              });
            }
          }
          toolResult = { success: true, booking: res.booking };
        } else if (functionName === "cancel_appointment") {
          const res = cancelAppointment({
            doctorName: args.doctorName,
            date: args.date,
            time: args.time
          });
          toolResult = { success: true, booking: res.booking };
        } else {
          toolResult = { error: `Tool ${functionName} is not supported.` };
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "An unexpected error occurred during tool execution.";
        toolResult = {
          success: false,
          error: errMsg
        };
      }

      history.push({
        role: "tool",
        tool_call_id: funcCall.id,
        content: JSON.stringify(toolResult)
      });
    }
  }

  return history;
}
