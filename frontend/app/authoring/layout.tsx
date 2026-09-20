import type { ReactNode } from "react";
import "./authoring.css";
export default function AuthoringLayout({ children }: { children: ReactNode }) {
  return <div className="authoring">{children}</div>;
}
