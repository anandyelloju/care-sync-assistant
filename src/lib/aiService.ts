import { OpenAI } from "openai";
import { getAvailableDoctors } from "../data/mockSchedule";

export interface ParsedAppointmentResult {
  intent: "BOOK_APPOINTMENT" | "UNKNOWN";
  doctor: string | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM
  timePreference: "morning" | "afternoon" | "evening" | null;
  patientName: string | null;
}

let openaiInstance: OpenAI | null = null;

/**
 * Instantiates and returns the OpenAI client configured for OpenRouter.
 */
export function getOpenRouterClient(): OpenAI {
  if (!openaiInstance) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    openaiInstance = new OpenAI({
      apiKey: apiKey || "mock-key", // Fallback for testing environments
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://caresync-assistant.example.com",
        "X-Title": "CareSync Assistant Demo"
      }
    });
  }
  return openaiInstance;
}

/**
 * Normalizes doctor names returned by the model to match the doctor database names.
 * For example, "Ravi" or "dr. ravi" will map to "Dr. Ravi".
 */
function normalizeDoctorName(name: string | null): string | null {
  if (!name) return null;
  const doctors = getAvailableDoctors();
  
  const cleanInput = name.toLowerCase().replace(/^dr\.?\s+/, "").trim();
  
  const match = doctors.find((doc) => {
    const cleanDoc = doc.toLowerCase().replace(/^dr\.?\s+/, "").trim();
    return cleanDoc === cleanInput;
  });
  
  return match || name; // Fall back to original extracted name if no match
}

/**
 * Normalizes the time preference string if any.
 */
function normalizeTimePreference(
  pref: string | null
): "morning" | "afternoon" | "evening" | null {
  if (!pref) return null;
  const lower = pref.toLowerCase().trim();
  if (lower === "morning" || lower === "afternoon" || lower === "evening") {
    return lower as "morning" | "afternoon" | "evening";
  }
  return null;
}

/**
 * Parses user natural language into structured appointment parameters.
 * 
 * @param userInput The natural language query from the patient.
 * @param currentDateStr Current date override for resolving relative dates (YYYY-MM-DD).
 */
export async function parseAppointmentRequest(
  userInput: string,
  currentDateStr?: string
): Promise<ParsedAppointmentResult> {
  const client = getOpenRouterClient();
  
  const referenceDate = currentDateStr || new Date().toISOString().split("T")[0];
  
  // Calculate day of the week for the reference date to assist the model
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = daysOfWeek[new Date(referenceDate).getDay()];
  
  const systemPrompt = `You are an AI assistant for CareSync, a healthcare appointment scheduler.
Your task is to analyze the user's natural language input and extract appointment scheduling parameters.

Current Date context:
- The current date is: ${referenceDate} (which is a ${dayName}).
- Resolve all relative date expressions (like "tomorrow", "next Monday", "day after tomorrow", "in 2 days") to their exact absolute dates in YYYY-MM-DD format using this current date context.

Extraction guidelines:
1. "intent": Set to "BOOK_APPOINTMENT" if the user expresses intent to schedule, book, request an appointment, check availability, or see a doctor. Set to "UNKNOWN" otherwise.
2. "doctor": Extract the doctor's name if specified (e.g., "Dr. Ravi", "Priya").
3. "date": Extract the date of the appointment in YYYY-MM-DD format. Resolve relative expressions. If no date is mentioned, set to null.
4. "time": Extract the exact time in HH:MM format (24-hour clock, e.g. "09:30", "15:00"). If no exact time is specified, set to null.
5. "timePreference": Extract a general preference for time of day: "morning" (08:00-11:59), "afternoon" (12:00-16:59), or "evening" (17:00-20:59).
6. "patientName": Extract the patient's name if provided (e.g., "I'm Sarah" or "for my son Timmy").

CRITICAL: Do NOT invent, guess, or assume any values. If information is missing, set the field to null.`;

  try {
    const response = await client.chat.completions.create({
      model: "x-ai/grok-2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userInput }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "parsed_appointment",
          strict: true,
          schema: {
            type: "object",
            properties: {
              intent: {
                type: "string",
                enum: ["BOOK_APPOINTMENT", "UNKNOWN"]
              },
              doctor: {
                anyOf: [{ type: "string" }, { type: "null" }]
              },
              date: {
                anyOf: [{ type: "string" }, { type: "null" }]
              },
              time: {
                anyOf: [{ type: "string" }, { type: "null" }]
              },
              timePreference: {
                anyOf: [
                  { type: "string", enum: ["morning", "afternoon", "evening"] },
                  { type: "null" }
                ]
              },
              patientName: {
                anyOf: [{ type: "string" }, { type: "null" }]
              }
            },
            required: [
              "intent",
              "doctor",
              "date",
              "time",
              "timePreference",
              "patientName"
            ],
            additionalProperties: false
          }
        }
      },
      temperature: 0
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response received from the OpenRouter model.");
    }
    
    const parsed = JSON.parse(content) as ParsedAppointmentResult;
    
    // Normalization and Validation
    return {
      intent: parsed.intent || "UNKNOWN",
      doctor: normalizeDoctorName(parsed.doctor),
      date: parsed.date || null,
      time: parsed.time || null,
      timePreference: normalizeTimePreference(parsed.timePreference),
      patientName: parsed.patientName || null
    };
  } catch (error) {
    console.error("Error parsing appointment request via OpenRouter:", error);
    throw error;
  }
}
