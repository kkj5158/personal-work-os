import { notFound } from "next/navigation";
import { Fixture } from "./Fixture";
import "../notes.css";
export default function Page() {
  if (process.env.NEXT_PUBLIC_APP_ENV === "prod") notFound();
  return <Fixture />;
}
