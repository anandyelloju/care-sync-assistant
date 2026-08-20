import { NextResponse } from "next/server";
import { runAgentConversation } from "../../../lib/agentService";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, currentDateStr } = body;
    
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages parameter" }, { status: 400 });
    }
    
    const updatedMessages = await runAgentConversation(messages, currentDateStr);
    return NextResponse.json({ messages: updatedMessages });
  } catch (error) {
    console.error("Chat API error:", error);
    const message = error instanceof Error ? error.message : "An error occurred during chat conversation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
