import { redirect } from "next/navigation";

/** Legacy standalone item-management route: checklist items are managed in Journal now. */
export default function Page() { redirect("/checklist"); }
