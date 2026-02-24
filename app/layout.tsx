import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import LayoutHeader from "@/components/LayoutHeader";

import "styles/globals.css";

export const metadata: Metadata = {
  title: "ScaleApp",
  description: "ScaleApp",
  icons: {
    icon: [
      { url: "/favicon.png?v=1", type: "image/png" },
      { url: "/favicon.ico?v=1", type: "image/x-icon" },
    ],
    shortcut: "/favicon.png?v=1",
    apple: "/favicon.png?v=1",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.png?v=1" type="image/png" />
        <link rel="icon" href="/favicon.ico?v=1" type="image/x-icon" />
        <link rel="shortcut icon" href="/favicon.png?v=1" />
        <link rel="apple-touch-icon" href="/favicon.png?v=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:ital,wght@0,100..900;1,100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-white dark:bg-gray-950 min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <div className="min-h-screen flex flex-col">
            <LayoutHeader />
            <main className="flex-1">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
