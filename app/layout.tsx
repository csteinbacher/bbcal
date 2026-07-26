import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Planboard — Month Planner",
  description: "A simple, visual month planner for multi-day work and events.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
