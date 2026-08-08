import React from "react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300 font-sans">
      {/* Header */}
      <header className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Elegant Brand Icon */}
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-teal-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              C
            </div>
            <span className="font-semibold text-xl tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              CareSync
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border border-teal-200/50 dark:border-teal-900/30">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
              Technical MVP
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto px-6 py-16 flex flex-col justify-center items-center">
        <div className="w-full max-w-2xl text-center space-y-8">
          
          {/* Hero Section */}
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-900/30">
              Introducing CareSync
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
              <span className="block bg-gradient-to-r from-indigo-600 via-indigo-500 to-teal-500 dark:from-indigo-400 dark:via-teal-400 dark:to-cyan-400 bg-clip-text text-transparent">
                CareSync
              </span>
              <span className="block text-2xl sm:text-3xl font-semibold mt-2 text-slate-700 dark:text-slate-300">
                AI Healthcare Appointment Assistant
              </span>
            </h1>
            
            <p className="text-slate-600 dark:text-slate-400 text-lg max-w-xl mx-auto leading-relaxed">
              A modern, intelligent approach to healthcare scheduling. CareSync will enable patients to find doctors and book appointments through natural conversation.
            </p>
          </div>

          {/* Placeholder Section */}
          <div className="relative group overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm transition-all duration-300 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700">
            <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 dark:bg-teal-500/10 rounded-bl-full pointer-events-none transition-transform duration-500 group-hover:scale-110"></div>
            
            <div className="flex flex-col items-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center text-teal-600 dark:text-teal-400">
                {/* Microphone Icon representing Voice capabilities */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-6 h-6 animate-pulse"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
                  />
                </svg>
              </div>
              
              <div className="space-y-2">
                <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-200">
                  Voice appointment booking coming next.
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  Our voice recognition agent is currently in development. You will soon be able to speak naturally to book appointments.
                </p>
              </div>

              {/* Status Indicator */}
              <div className="pt-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 border border-indigo-200/30 dark:border-indigo-900/30">
                  Phase 2 Implementation
                </span>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 dark:border-slate-800/80 bg-white/50 dark:bg-slate-950/50 py-8 text-center text-sm text-slate-500 dark:text-slate-400 mt-auto">
        <div className="max-w-5xl mx-auto px-6">
          <p>© {new Date().getFullYear()} CareSync Assistant Demo. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
