import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://planboard-calendar-2026.im-topher.chatgpt.site"),
  title: "BBCal — Visual Calendar Planner",
  description: "BBCal is a bold, full-screen month planner for multi-day work and events.",
  openGraph: {
    title: "BBCal — Visual Calendar Planner",
    description: "Plan the month. See the work.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "BBCal — Visual Calendar Planner",
    description: "Plan the month. See the work.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
