import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LLM Cost & Usage Tracker | Real-time Proxy Dashboard",
  description: "Proxy-based cost, latency, usage, and response caching tracker for LLM API calls."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased selection:bg-emerald-500/30 selection:text-emerald-300">
        <div className="fixed inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))] pointer-events-none z-0" />
        <div className="relative z-10 min-h-screen flex flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
