import { vi, describe, it, expect, beforeEach, MockInstance } from "vitest";
import { POST as chatHandler } from "../../app/api/chat/route";
import { POST as resetHandler } from "../../app/api/reset/route";
import { getOpenRouterClient } from "../aiService";
import { resetSchedule, getSchedule, updateSlotStatus } from "../../data/mockSchedule";

// Mock the openai module
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

describe("CareSync API Route Handlers", () => {
  let mockCreateSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSchedule();
    
    // Retrieve OpenAI mocked client
    const client = getOpenRouterClient();
    mockCreateSpy = vi.spyOn(client.chat.completions, "create");
  });

  describe("POST /api/reset", () => {
    it("should reset the mock schedule state successfully", async () => {
      // Pre-condition: Mutate a slot to booked
      const beforeSlot = getSchedule().find(
        (s) => s.doctorName === "Dr. Ravi" && s.date === "2026-08-09" && s.time === "10:30"
      );
      expect(beforeSlot?.isBooked).toBe(false);
      updateSlotStatus("Dr. Ravi", "2026-08-09", "10:30", true);
      
      const mutatedSlot = getSchedule().find(
        (s) => s.doctorName === "Dr. Ravi" && s.date === "2026-08-09" && s.time === "10:30"
      );
      expect(mutatedSlot?.isBooked).toBe(true);

      // Execute reset handler
      const response = await resetHandler();
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.success).toBe(true);

      // Post-condition: Slot should be reset to free
      const afterSlot = getSchedule().find(
        (s) => s.doctorName === "Dr. Ravi" && s.date === "2026-08-09" && s.time === "10:30"
      );
      expect(afterSlot?.isBooked).toBe(false);
    });
  });

  describe("POST /api/chat", () => {
    it("should return 400 for invalid body or missing messages parameter", async () => {
      const request = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({})
      });

      const response = await chatHandler(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toContain("messages");
    });

    it("should execute agent conversation successfully and return updated messages", async () => {
      mockCreateSpy.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "Which doctor would you like to see?",
              tool_calls: null
            }
          }
        ]
      });

      const request = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "I need an appointment." }],
          currentDateStr: "2026-08-08"
        })
      });

      const response = await chatHandler(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.messages.length).toBe(3); // system instruction + user prompt + assistant response
      expect(body.messages[2].content).toBe("Which doctor would you like to see?");
    });
  });
});
