"use client";

import React, { useState, useRef, useEffect } from "react";

interface ChatMessage {
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

interface BookingDetails {
  doctorName: string;
  date: string;
  time: string;
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Derive booking details from the messages array during render (no useEffect needed)
  const lastToolBooking = [...messages]
    .reverse()
    .find((m) => m.role === "tool" && m.content?.includes('"booking"'));
  
  let booking: BookingDetails | null = null;
  if (lastToolBooking && lastToolBooking.content) {
    try {
      const parsed = JSON.parse(lastToolBooking.content);
      if (parsed.success && parsed.booking) {
        booking = {
          doctorName: parsed.booking.doctorName,
          date: parsed.booking.date,
          time: parsed.booking.time,
        };
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Send message
  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;
    
    if (!textToSend) setInput(""); // Clear field if sent from input
    setError(null);
    setLoading(true);

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          currentDateStr: "2026-08-08", // Consistent mock date (Saturday)
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch response from agent.");
      }

      setMessages(data.messages);
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Reset conversation and db
  const handleReset = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      if (!res.ok) {
        throw new Error("Failed to reset doctor schedule.");
      }
      setMessages([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reset session.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Filter messages for display (only user & assistant messages with content)
  const visibleMessages = messages.filter(
    (m) => (m.role === "user" || m.role === "assistant") && m.content !== null
  );

  // Helper template prompts
  const samplePrompts = [
    { label: "Book Dr. Ravi", text: "I want an appointment with Dr. Ravi tomorrow morning." },
    { label: "Confirm proposed slot", text: "Yes, go ahead and book it." },
    { label: "Check alternative options", text: "Can I see Dr. Priya next Monday?" },
  ];

  // Formatting helpers
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

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
      {/* Header */}
      <header className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-teal-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              C
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent block leading-tight">
                CareSync
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block leading-none">
                AI Healthcare Assistant
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              disabled={loading}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-850 hover:text-slate-800 dark:hover:text-white transition-all disabled:opacity-50"
            >
              Clear Conversation
            </button>
          </div>
        </div>
      </header>

      {/* Main Body Grid */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 flex flex-col md:flex-row gap-6 h-[calc(100vh-4rem)]">
        
        {/* Left Side: Chat Workspace */}
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-sm">
          
          {/* Messages Panel */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {visibleMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto py-12">
                <div className="w-12 h-12 rounded-full bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center text-teal-600 dark:text-teal-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                  Welcome to CareSync
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Speak naturally to check doctor schedules, ask for alternatives, or confirm bookings. Try using a prompt from the helper panel on the right.
                </p>
              </div>
            ) : (
              visibleMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm transition-all duration-300 ${
                      msg.role === "user"
                        ? "bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white rounded-tr-none"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none border border-slate-200/50 dark:border-slate-700/50"
                    }`}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))
            )}

            {/* Loading Indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-tl-none px-5 py-3 border border-slate-200/50 dark:border-slate-700/50 flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-bounce"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-bounce delay-100"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-bounce delay-200"></span>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4 text-sm text-red-600 dark:text-red-400 flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                <p>{error}</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Panel */}
          <div className="p-4 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/20">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your appointment request here..."
                disabled={loading}
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2.5 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-xl px-5 bg-gradient-to-tr from-teal-500 to-indigo-600 text-white text-sm font-semibold shadow hover:opacity-95 transition-all disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </div>
        </div>

        {/* Right Side: Appointment Details & Helper Tools */}
        <div className="w-full md:w-80 flex flex-col gap-6">
          
          {/* Successful Booking Banner */}
          {booking && (
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-md relative overflow-hidden group animate-fade-in">
              {/* Glowing ring background */}
              <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none transition-transform duration-500 group-hover:scale-125"></div>
              
              <div className="flex items-center gap-3 border-b border-white/20 pb-4 mb-4">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-sm leading-tight">Appointment Confirmed</h4>
                  <p className="text-[10px] text-emerald-100 leading-none mt-0.5">CareSync Schedule Engine</p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-[10px] text-emerald-100 block uppercase font-medium tracking-wide">Doctor</span>
                  <span className="font-semibold">{booking.doctorName}</span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-100 block uppercase font-medium tracking-wide">Date</span>
                  <span className="font-semibold">{formatDate(booking.date)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-100 block uppercase font-medium tracking-wide">Time</span>
                  <span className="font-semibold">{formatTime(booking.time)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Quick Prompts Panel */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm">
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">
              Demo Helper Prompts
            </h4>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 leading-relaxed">
              Use these templates to test the conversational scheduling workflow (Mock Today is Saturday, Aug 8, 2026).
            </p>
            <div className="space-y-3">
              {samplePrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(p.text)}
                  disabled={loading}
                  className="w-full text-left p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs text-slate-600 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all disabled:opacity-50"
                >
                  <span className="block font-bold text-slate-800 dark:text-slate-200 mb-0.5">{p.label}</span>
                  <span className="block italic leading-relaxed">&quot;{p.text}&quot;</span>
                </button>
              ))}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
