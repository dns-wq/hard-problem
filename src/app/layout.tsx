import type { Metadata } from "next";
import { Hanken_Grotesk, Source_Serif_4 } from "next/font/google";
import { TRPCProvider } from "@/lib/trpc/provider";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { Header } from "@/components/layout/Header";
import { OnboardingModal } from "@/components/layout/OnboardingModal";
import "./globals.css";

// Humanist grotesk for UI (à la Helsinki Grotesk) + a reading serif. Exposed as
// CSS variables consumed by globals.css.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hard Problem",
  description:
    "A learning platform for STEM professionals to develop rigorous thinking about technology ethics — using real papers, structured peer discussion, and AI grounded in source material.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${hanken.variable} ${sourceSerif.variable}`} suppressHydrationWarning>
      <body>
        <TRPCProvider>
          <ThemeProvider>
            <Header />
            <main>{children}</main>
            <OnboardingModal />
          </ThemeProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
