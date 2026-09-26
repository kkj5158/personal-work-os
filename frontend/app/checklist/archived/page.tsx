import { redirect } from "next/navigation";

/** Legacy standalone archive route: archived items open in Journal's archived view. */
export default function Page() { redirect("/checklist?archived=1"); }
