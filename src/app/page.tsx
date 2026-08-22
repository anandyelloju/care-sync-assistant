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

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      [index: number]: {
        transcript: string;
        confidence: number;
      };
      isFinal: boolean;
    };
  };
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface ISpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface ISpeechRecognitionConstructor {
  new (): ISpeechRecognition;
}

interface WindowWithSpeech extends Window {
  SpeechRecognition?: ISpeechRecognitionConstructor;
  webkitSpeechRecognition?: ISpeechRecognitionConstructor;
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice Interaction State
  type VoiceState = "ready" | "listening" | "processing" | "speaking" | "error";
  const [voiceState, setVoiceState] = useState<VoiceState>("ready");
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check Speech Recognition support on mount
  useEffect(() => {
    const win = window as unknown as WindowWithSpeech;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    setTimeout(() => {
      setIsSpeechSupported(!!SpeechRecognition);
    }, 0);
  }, []);

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

  // Text to Speech
  const speakText = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setVoiceState("ready");
      return;
    }

    window.speechSynthesis.cancel();
    
    // Remove markdown symbols for clear pronunciation
    const cleanText = text.replace(/[*#`_\-]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);

    utterance.onstart = () => {
      setVoiceState("speaking");
    };

    utterance.onend = () => {
      setVoiceState("ready");
    };

    utterance.onerror = (event) => {
      console.error("SpeechSynthesisUtterance error:", event);
      // Reset voice state to ready so the user can interact again.
      // Do not set global error since text chat remains fully functional.
      setVoiceState("ready");
    };

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeech = () => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setVoiceState("ready");
  };

  // Speech to Text
  const startListening = () => {
    if (typeof window === "undefined") return;

    const win = window as unknown as WindowWithSpeech;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser.");
      setVoiceState("error");
      return;
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    setError(null);
    setVoiceState("listening");

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognitionRef.current = recognition;
    let receivedTranscript = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      if (transcript && transcript.trim()) {
        receivedTranscript = true;
        handleSend(transcript, true);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        setError("Microphone permission denied. Please allow microphone access in browser settings.");
      } else if (event.error === "no-speech") {
        setVoiceState("ready");
        return;
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
      setVoiceState("error");
    };

    recognition.onend = () => {
      setVoiceState((current) => {
        if (current === "listening" && !receivedTranscript) {
          return "ready";
        }
        return current;
      });
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start speech recognition:", e);
      setError("Failed to start speech recognition.");
      setVoiceState("error");
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setVoiceState("ready");
  };

  const toggleVoice = () => {
    if (voiceState === "ready" || voiceState === "error") {
      startListening();
    } else if (voiceState === "listening") {
      stopListening();
    } else if (voiceState === "speaking") {
      stopSpeech();
    } else if (voiceState === "processing") {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      setVoiceState("ready");
    }
  };

  // Send message
  const handleSend = async (textToSend?: string, isVoice = false) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;
    
    if (!textToSend) setInput(""); // Clear field if sent from input
    setError(null);
    setLoading(true);

    if (isVoice) {
      setVoiceState("processing");
    }

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

      // Speak response if request was voice-based
      if (isVoice) {
        const assistantMsgs = data.messages.filter((m: ChatMessage) => m.role === "assistant" && m.content);
        const lastAssistantMsg = assistantMsgs[assistantMsgs.length - 1];
        if (lastAssistantMsg && lastAssistantMsg.content) {
          speakText(lastAssistantMsg.content);
        } else {
          setVoiceState("ready");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
      if (isVoice) {
        setVoiceState("error");
      }
    } finally {
      setLoading(false);
    }
  };

  // Reset conversation and db
  const handleReset = async () => {
    setLoading(true);
    setError(null);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    setVoiceState("ready");

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
                  Speak naturally to check doctor schedules, ask for alternatives, or confirm bookings. Click the voice assistant button on the right to start speaking.
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
          
          {/* Voice Assistant Panel */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
            <div className="w-full text-left mb-4">
              <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                Voice Assistant
              </h4>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-normal">
                Book hands-free using browser speech capabilities.
              </p>
            </div>

            {!isSpeechSupported ? (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                <p className="font-semibold mb-1">Speech API Not Supported</p>
                <p>Try using Google Chrome or Microsoft Edge to use browser-native speech features.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center w-full py-4 space-y-4">
                
                {/* Visual mic button with pulse rings */}
                <div className="relative flex items-center justify-center w-24 h-24">
                  {voiceState === "listening" && (
                    <>
                      <span className="absolute inline-flex h-full w-full rounded-full bg-teal-400/35 dark:bg-teal-500/25 animate-ping"></span>
                      <span className="absolute inline-flex h-20 w-20 rounded-full bg-teal-400/20 dark:bg-teal-500/15 animate-pulse"></span>
                    </>
                  )}
                  {voiceState === "speaking" && (
                    <>
                      <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-400/35 dark:bg-indigo-500/25 animate-ping"></span>
                      <span className="absolute inline-flex h-20 w-20 rounded-full bg-indigo-400/20 dark:bg-indigo-500/15 animate-pulse"></span>
                    </>
                  )}
                  
                  <button
                    onClick={toggleVoice}
                    className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center shadow-md transition-all duration-300 transform hover:scale-105 active:scale-95 ${
                      voiceState === "listening"
                        ? "bg-teal-500 text-white"
                        : voiceState === "speaking"
                        ? "bg-indigo-600 text-white"
                        : voiceState === "processing"
                        ? "bg-amber-500 text-white animate-pulse"
                        : voiceState === "error"
                        ? "bg-rose-600 text-white animate-bounce"
                        : "bg-gradient-to-tr from-teal-500 to-indigo-600 text-white"
                    }`}
                    aria-label="Toggle Voice Assistant"
                  >
                    {voiceState === "listening" ? (
                      // Recording Wave SVG
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                      </svg>
                    ) : voiceState === "speaking" ? (
                      // Speaking / Mute option SVG
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7 animate-pulse">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                      </svg>
                    ) : voiceState === "processing" ? (
                      // Loading spinner SVG
                      <svg className="animate-spin h-7 w-7 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : voiceState === "error" ? (
                      // Error warning SVG
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                      </svg>
                    ) : (
                      // Microphone standard SVG
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* State Label & Description */}
                <div className="space-y-1">
                  <span className={`text-xs font-bold uppercase tracking-wider ${
                    voiceState === "listening"
                      ? "text-teal-600 dark:text-teal-400"
                      : voiceState === "speaking"
                      ? "text-indigo-600 dark:text-indigo-400"
                      : voiceState === "processing"
                      ? "text-amber-600 dark:text-amber-400"
                      : voiceState === "error"
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-slate-600 dark:text-slate-350"
                  }`}>
                    {voiceState === "ready" && "Ready"}
                    {voiceState === "listening" && "Listening"}
                    {voiceState === "processing" && "Processing"}
                    {voiceState === "speaking" && "Speaking"}
                    {voiceState === "error" && "Error"}
                  </span>
                  
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-normal max-w-[200px]">
                    {voiceState === "ready" && "Click button and speak appointment request."}
                    {voiceState === "listening" && "Listening to your voice. Speak naturally..."}
                    {voiceState === "processing" && "CareSync Agent is analyzing schedule details..."}
                    {voiceState === "speaking" && "Reading AI response aloud. Click to mute."}
                    {voiceState === "error" && "Click button to retry voice assistant."}
                  </p>
                </div>
              </div>
            )}
          </div>

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
