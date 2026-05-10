import type { Metadata } from "next";
import { Inter_Tight, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { TopBar } from "@/components/layout";
import "./globals.css";

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--ff-display-loaded",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--ff-ui-loaded",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--ff-mono-loaded",
});

export const metadata: Metadata = {
  title: "Afferent — Cost of Service",
  description: "Town of Los Altos Hills · Development Services Fee Study",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body>
        <TopBar/>
        {children}
      </body>
    </html>
  );
}
