"use client";
import { Home, Library } from "lucide-react";
import { SharedSidebar } from "@/components/Sidebar";

export function AuthoringSidebar({ active, navigate }: { active: "home" | "library"; navigate: (path: string) => void }) {
  return <SharedSidebar system="AUTHORING" navigate={navigate} groups={[{ section: "AUTHORING", items: [
    { label: "Home", icon: Home, active: active === "home", destination: "/authoring" },
    { label: "Library", icon: Library, active: active === "library", destination: "/authoring/library" },
  ] }]} />;
}
