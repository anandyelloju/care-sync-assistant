import { vi, describe, it, expect, beforeEach, MockInstance } from "vitest";
import { parseAppointmentRequest, getOpenRouterClient } from "../aiService";

// Mock the openai module with a real ES6 class template
vi.mock("openai", () => {
  return {
    OpenAI: class MockOpenAI {
      chat = {
        completions: {
          create: async () => {
            return {};
          }
        }
      };
    }
  };
});

describe("CareSync AI Service (OpenRouter)", () => {
  let mockCreateSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Retrieve the mocked OpenAI client instance and spy on the chat completion method
    const client = getOpenRouterClient();
    mockCreateSpy = vi.spyOn(client.chat.completions, "create");
  });

  it("should successfully parse a valid request and normalize doctor name", async () => {
    // Setup mock response
    mockCreateSpy.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: "BOOK_APPOINTMENT",
              doctor: "Ravi",
              date: "2026-08-09",
              time: null,
              timePreference: "morning",
              patientName: null
            })
          }
        }
      ]
    });

    const result = await parseAppointmentRequest(
      "I want to see Dr. Ravi tomorrow morning.",
      "2026-08-08"
    );

    // Assertions
    expect(result).toEqual({
      intent: "BOOK_APPOINTMENT",
      doctor: "Dr. Ravi", // Normalization checks out
      date: "2026-08-09",
      time: null,
      timePreference: "morning",
      patientName: null
    });

    // Check prompt verification
    expect(mockCreateSpy).toHaveBeenCalledTimes(1);
    const apiCallArgs = mockCreateSpy.mock.calls[0][0];
    expect(apiCallArgs.model).toBe("x-ai/grok-2");
    expect(apiCallArgs.messages[0].content).toContain("2026-08-08");
    expect(apiCallArgs.messages[1].content).toBe("I want to see Dr. Ravi tomorrow morning.");
  });

  it("should successfully extract patient name and exact time", async () => {
    mockCreateSpy.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: "BOOK_APPOINTMENT",
              doctor: "Dr. Priya",
              date: "2026-08-10",
              time: "14:30",
              timePreference: "afternoon",
              patientName: "Alice"
            })
          }
        }
      ]
    });

    const result = await parseAppointmentRequest(
      "My name is Alice and I want to book Priya for next Monday at 2:30 PM.",
      "2026-08-08" // Saturday, next monday is 2026-08-10
    );

    expect(result).toEqual({
      intent: "BOOK_APPOINTMENT",
      doctor: "Dr. Priya",
      date: "2026-08-10",
      time: "14:30",
      timePreference: "afternoon",
      patientName: "Alice"
    });
  });

  it("should keep missing information as null rather than hallucinating", async () => {
    mockCreateSpy.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: "BOOK_APPOINTMENT",
              doctor: null,
              date: null,
              time: null,
              timePreference: null,
              patientName: null
            })
          }
        }
      ]
    });

    const result = await parseAppointmentRequest("I want to make an appointment.");

    expect(result).toEqual({
      intent: "BOOK_APPOINTMENT",
      doctor: null,
      date: null,
      time: null,
      timePreference: null,
      patientName: null
    });
  });

  it("should parse non-appointment intents correctly as UNKNOWN", async () => {
    mockCreateSpy.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: "UNKNOWN",
              doctor: null,
              date: null,
              time: null,
              timePreference: null,
              patientName: null
            })
          }
        }
      ]
    });

    const result = await parseAppointmentRequest("What are your business hours?");

    expect(result).toEqual({
      intent: "UNKNOWN",
      doctor: null,
      date: null,
      time: null,
      timePreference: null,
      patientName: null
    });
  });

  it("should propagate errors if the OpenAI/OpenRouter API call fails", async () => {
    mockCreateSpy.mockRejectedValue(new Error("API Rate Limit Exceeded"));

    await expect(
      parseAppointmentRequest("I want to see Dr. Ravi tomorrow.")
    ).rejects.toThrow("API Rate Limit Exceeded");
  });
});
