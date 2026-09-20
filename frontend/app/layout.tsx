import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { GlobalTabsProvider } from "@/components/GlobalTabs";
import "./shell.css";
import { SystemOrderProvider } from "@/components/SystemOrder";
import { RouteContent, RouteStateProvider } from "@/components/RouteState";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Personal OS", template: "%s | Personal OS" },
  description: "WORK OS · NOTE SYS · DIET SYS · LIFE CODE · Calendar",
  applicationName: "Personal OS",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/orbit-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/orbit-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Personal OS", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#f7f8fa", colorScheme: "light" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SystemOrderProvider><RouteStateProvider><GlobalTabsProvider>
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <RouteContent>{children}</RouteContent>
        </div>
        </GlobalTabsProvider></RouteStateProvider></SystemOrderProvider>
      </body>
    </html>
  );
}
