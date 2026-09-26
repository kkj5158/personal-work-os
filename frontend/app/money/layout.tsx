import { MoneyDataProvider } from "./MoneyDataProvider";
export default function MoneyLayout({ children }: { children: React.ReactNode }) {
  return <MoneyDataProvider>{children}</MoneyDataProvider>;
}
