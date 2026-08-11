import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PulseOS",
  description: "Privacy-conscious web analytics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
