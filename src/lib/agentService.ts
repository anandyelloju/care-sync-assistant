import { getOpenRouterClient } from "./aiService";
import {
  checkAvailability,
  findAlternativeSlots,
  bookAppointment
} from "./appointmentEngine";

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

/**
 * Generates local simulated model completion responses when no API key is set.
 */
function simulateModelResponse(history: ChatMessage[]): MockChoiceMessage {
  const lastMsg = history[history.length - 1];
  
  if (!lastMsg) {
    return {
      content: "I'm CareSync's AI assistant. To book an appointment, try using one of the helper prompts on the right, like \"Book Dr. Ravi\".",
    };
  }

  // 1. If the last message is a user message
  if (lastMsg.role === "user") {
    const text = (lastMsg.content || "").toLowerCase();
    
    // Check for confirmation intent first
    if (text.includes("yes") || text.includes("book") || text.includes("confirm")) {
      // Find which doctor was previously proposed
      const previousProposal = [...history].reverse().find(
        (m) => m.role === "assistant" && m.content !== null
      );
      const isRavi = previousProposal?.content?.includes("Ravi");
      const isPriya = previousProposal?.content?.includes("Priya");
      
      if (isRavi) {
        return {
          content: null,
          tool_calls: [
            {
              id: "mock-book-ravi",
              type: "function",
              function: {
                name: "book_appointment",
                arguments: JSON.stringify({ doctorName: "Dr. Ravi", date: "2026-08-09", time: "10:30" }),
              },
            },
          ],
        };
      }
      
      if (isPriya) {
        return {
          content: null,
          tool_calls: [
            {
              id: "mock-book-priya",
              type: "function",
              function: {
                name: "book_appointment",
                arguments: JSON.stringify({ doctorName: "Dr. Priya", date: "2026-08-10", time: "09:30" }),
              },
            },
          ],
        };
      }
    }
    
    // Check for doctor check intents
    if (text.includes("ravi")) {
      return {
        content: null,
        tool_calls: [
          {
            id: "mock-check-ravi",
            type: "function",
            function: {
              name: "check_availability",
              arguments: JSON.stringify({ doctorName: "Dr. Ravi", date: "2026-08-09", timePreference: "morning" }),
            },
          },
        ],
      };
    }
    
    if (text.includes("priya")) {
      return {
        content: null,
        tool_calls: [
          {
            id: "mock-check-priya",
            type: "function",
            function: {
              name: "check_availability",
              arguments: JSON.stringify({ doctorName: "Dr. Priya", date: "2026-08-10", timePreference: "morning" }),
            },
          },
        ],
      };
    }

    return {
      content: "I'm CareSync's AI assistant. To book an appointment, try using one of the helper prompts on the right, like \"Book Dr. Ravi\".",
    };
  }

  // 2. If the last message is a tool response
  if (lastMsg.role === "tool") {
    const callId = lastMsg.tool_call_id;
    let toolResult: { success?: boolean; available?: boolean; booking?: { doctorName: string; date: string; time: string } } = {};
    try {
      toolResult = JSON.parse(lastMsg.content || "{}");
    } catch {
      // Ignore JSON parse errors
    }
    
    if (callId?.startsWith("mock-check-ravi")) {
      if (toolResult.success && toolResult.available) {
        return {
          content: "Dr. Ravi has an opening at 10:30 AM tomorrow. Would you like me to book it?",
        };
      }
    }
    
    if (callId?.startsWith("mock-check-priya")) {
      if (toolResult.success && toolResult.available) {
        return {
          content: "Dr. Priya has an opening at 09:30 AM next Monday. Would you like me to book it?",
        };
      }
    }
    
    if (callId?.startsWith("mock-book-ravi")) {
      if (toolResult.success) {
        return {
          content: "Your appointment with Dr. Ravi is confirmed for 10:30 AM tomorrow.",
        };
      }
    }
    
    if (callId?.startsWith("mock-book-priya")) {
      if (toolResult.success) {
        return {
          content: "Your appointment with Dr. Priya is confirmed for 09:30 AM next Monday.",
        };
      }
    }
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
  const hasSystemMessage = history.some((m) => m.role === "system");
  if (!hasSystemMessage) {
    const systemPrompt = `You are CareSync's AI assistant, a helpful and precise healthcare appointment scheduler.
Your job is to assist patients in checking availability, finding alternative slots, and booking appointments with our doctors (Dr. Ravi and Dr. Priya).

Current date context:
- The current date is: ${referenceDate} (which is a ${dayName}).
- Always resolve relative expressions like "tomorrow", "next Monday" to their exact absolute dates in YYYY-MM-DD format before passing them to any tool.

Guidelines for conversation flow:
1. CHECK AVAILABILITY: When a user asks for an appointment, use the 'check_availability' tool first.
2. DISCUSSING SLOTS:
   - If 'check_availability' returns an available slot, present the slot details (doctor, date, time) to the user and ASK for their explicit confirmation (e.g., "Dr. Ravi has an opening at 10:00 AM tomorrow. Would you like me to book it?").
   - If 'check_availability' indicates the slot is unavailable, or if the user asks for other slots, call 'find_alternative_slots' immediately. Offer the returned alternatives to the user (e.g., "Dr. Ravi isn't available at 10:00 AM. I can offer 11:00 AM or 2:00 PM. Which works for you?").
3. CONFIRMATION REQUIRED:
   - DO NOT call the 'book_appointment' tool until the user has explicitly confirmed the specific slot you proposed (e.g., "yes", "please book that", "confirm 10:00 AM").
   - If they say "yes" without a specific time, but you just proposed a single slot, you can assume they are confirming that slot.
4. MISSING INFORMATION:
   - If crucial details (like doctor name or date) are missing from the request, ask the user for them directly instead of guessing or invoking tools with empty or assumed parameters.
5. DOMAIN ERRORS:
   - If a tool fails with an error (e.g., DoctorNotFound, SlotNotFound, SlotUnavailable), explain the error politely to the user. For instance, if the doctor is not found, list the available doctors (Dr. Ravi and Dr. Priya).`;

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
          const res = bookAppointment({
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
