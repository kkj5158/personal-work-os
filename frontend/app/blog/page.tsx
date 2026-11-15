import type { Metadata } from "next";
export const metadata: Metadata = { title: "Blog · LOG" };
export default function BlogPage() {
  return <iframe title="LOG 개인 기록 목업" src="/blog-log-preview.html" style={{ display: "block", width: "100%", height: "calc(100dvh - 40px)", border: 0, background: "#f8f9fc" }} />;
}
