import { vi, describe, it, expect, beforeEach, MockInstance } from "vitest";
import { runAgentConversation } from "../agentService";
import { getOpenRouterClient } from "../aiService";
import { resetSchedule, getSchedule } from "../../data/mockSchedule";

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

describe("CareSync AI Agent Service (OpenRouter Tools)", () => {
  let mockCreateSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSchedule();
    
    // Retrieve the mocked OpenAI client instance and spy on the chat completion method
    const client = getOpenRouterClient();
    mockCreateSpy = vi.spyOn(client.chat.completions, "create");
  });

  it("should check availability when user requests an appointment", async () => {
    // 1st Turn: Model decides to call 'check_availability'
    mockCreateSpy.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-123",
                type: "function",
                function: {
                  name: "check_availability",
                  arguments: JSON.stringify({
                    doctorName: "Dr. Ravi",
                    date: "2026-08-09",
                    timePreference: "morning"
                  })
                }
              }
            ]
          }
        }
      ]
    });

    // 2nd Turn: After tool output, model replies in natural language
    mockCreateSpy.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: "Dr. Ravi has openings at 09:00 AM and 10:30 AM tomorrow morning. Would you like me to book one of these?",
            tool_calls: null
          }
        }
      ]
    });

    const conversation = await runAgentConversation(
      [{ role: "user", content: "I want an appointment with Dr. Ravi tomorrow morning." }],
      "2026-08-08"
    );

    // Assert completions was called twice
    expect(mockCreateSpy).toHaveBeenCalledTimes(2);

    // Assert final message is text from assistant
    const finalMessage = conversation[conversation.length - 1];
    expect(finalMessage.role).toBe("assistant");
    expect(finalMessage.content).toContain("opening");
    
    // Assert tool output message exists in the conversation history
    const toolMsg = conversation.find(m => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.tool_call_id).toBe("call-123");
    
    const parsedResult = JSON.parse(toolMsg?.content || "{}");
    expect(parsedResult.success).toBe(true);
    expect(parsedResult.available).toBe(true);
  });

  it("should look up alternative slots if check_availability returns no free openings", async () => {
    // 1st Turn: Check availability for Dr. Ravi at 09:30 AM (which is booked in mockSchedule)
    mockCreateSpy.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-check",
                type: "function",
                function: {
                  name: "check_availability",
                  arguments: JSON.stringify({
                    doctorName: "Dr. Ravi",
                    date: "2026-08-09",
                    time: "09:30"
                  })
                }
              }
            ]
          }
        }
      ]
    });

    // 2nd Turn: Model sees it's unavailable, calls 'find_alternative_slots'
    mockCreateSpy.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-alt",
                type: "function",
                function: {
                  name: "find_alternative_slots",
                  arguments: JSON.stringify({
                    doctorName: "Dr. Ravi",
                    date: "2026-08-09",
                    time: "09:30"
                  })
                }
              }
            ]
          }
        }
      ]
    });

    // 3rd Turn: Model suggests alternatives to user in text
    mockCreateSpy.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: "Dr. Ravi is not available at 09:30 AM tomorrow. However, I can offer 10:30 AM, 09:00 AM, or 11:00 AM. Do any of those work?",
            tool_calls: null
          }
        }
      ]
    });

    const conversation = await runAgentConversation(
      [{ role: "user", content: "Can I book Dr. Ravi at 9:30 AM tomorrow?" }],
      "2026-08-08"
    );

    expect(mockCreateSpy).toHaveBeenCalledTimes(3);

    // Verify tools were called
    const toolMsgs = conversation.filter(m => m.role === "tool");
    expect(toolMsgs.length).toBe(2);

    const checkRes = JSON.parse(toolMsgs[0].content || "{}");
    expect(checkRes.available).toBe(false);

    const altRes = JSON.parse(toolMsgs[1].content || "{}");
    expect(altRes.success).toBe(true);
    expect(altRes.alternatives.length).toBeGreaterThan(0);

    const finalMessage = conversation[conversation.length - 1];
    expect(finalMessage.role).toBe("assistant");
    expect(finalMessage.content).toContain("10:30 AM");
  });

  it("should book the appointment after receiving user confirmation", async () => {
    // Check initial schedule
    const raviSlotInitial = getSchedule().find(
      s => s.doctorName === "Dr. Ravi" && s.date === "2026-08-09" && s.time === "10:30"
    );
    expect(raviSlotInitial?.isBooked).toBe(false);

    // 1st Turn: Call book_appointment tool
    mockCreateSpy.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-book",
                type: "function",
                function: {
                  name: "book_appointment",
                  arguments: JSON.stringify({
                    doctorName: "Dr. Ravi",
                    date: "2026-08-09",
                    time: "10:30"
                  })
                }
              }
            ]
          }
        }
      ]
    });

    // 2nd Turn: Confirm booking in text
    mockCreateSpy.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: "Perfect, I have booked Dr. Ravi for you at 10:30 AM on 2026-08-09.",
            tool_calls: null
          }
        }
      ]
    });

    const conversation = await runAgentConversation(
      [
        { role: "user", content: "I want an appointment with Dr. Ravi tomorrow morning." },
        { role: "assistant", content: "Dr. Ravi has an opening at 10:30 AM. Would you like me to book it?" },
        { role: "user", content: "Yes please, go ahead and book it." }
      ],
      "2026-08-08"
    );

    expect(mockCreateSpy).toHaveBeenCalledTimes(2);

    // Check slot status in database is mutated to booked
    const raviSlotPost = getSchedule().find(
      s => s.doctorName === "Dr. Ravi" && s.date === "2026-08-09" && s.time === "10:30"
    );
    expect(raviSlotPost?.isBooked).toBe(true);

    const finalMessage = conversation[conversation.length - 1];
    expect(finalMessage.content).toContain("booked");
  });
});
