import type { Metadata } from "next";
import { TRPCProvider } from "@/lib/trpc/provider";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { Header } from "@/components/layout/Header";
import { OnboardingModal } from "@/components/layout/OnboardingModal";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hard Problem",
  description:
    "A learning platform for STEM professionals to develop rigorous thinking about technology ethics — using real papers, structured peer discussion, and AI grounded in source material.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
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
