import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ApexEngine — Financial Backtesting & Live Dashboard",
  description: "High-throughput financial backtesting engine and real-time visualization sandbox.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
