import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { GlobalTabsProvider } from "@/components/GlobalTabs";
import "./shell.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Orbit",
  description: "WORK OS · NOTE SYS · LIFE CODE · Calendar",
  applicationName: "Orbit",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/orbit-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/orbit-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Orbit", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#f7f8fa", colorScheme: "light" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GlobalTabsProvider>
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
        </div>
        </GlobalTabsProvider>
      </body>
    </html>
  );
}
