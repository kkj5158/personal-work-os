import type { Metadata } from "next";
import LogApp from "./LogApp";
export const metadata: Metadata = { title: "Blog · LOG" };
export default function BlogPage() {
  return <LogApp />;
}
