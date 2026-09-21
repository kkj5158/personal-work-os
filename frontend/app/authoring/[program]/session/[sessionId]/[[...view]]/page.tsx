import { notFound } from "next/navigation";
import AuthoringSession from "../../../../AuthoringSession";
export default async function Page({ params }: { params: Promise<{ program: string; sessionId: string; view?: string[] }> }) {
  const { program, sessionId, view = [] } = await params;
  if (!["quick-motivation", "recovery", "reality", "grounded-future", "past", "review"].includes(program) || !/^[\da-f-]{36}$/i.test(sessionId) || view.length > 1 || (view.length && !["full", "report"].includes(view[0]))) notFound();
  return <AuthoringSession key={sessionId} programKey={program} sessionId={sessionId} mode={(view[0] ?? "runner") as "runner" | "full" | "report"} />;
}
