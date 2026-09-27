"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChartNoAxesCombined,
  List,
  BookOpen,
  Wallet,
  Landmark,
  Inbox,
  Settings,
  RefreshCw,
} from "lucide-react";
import { SharedSidebar } from "@/components/Sidebar";
import {
  useGlobalTabs,
  useShellNavigationGuard,
} from "@/components/GlobalTabs";
import { type Account, type Category } from "@/lib/money/model";
import { presetPeriod, type Period } from "@/lib/money/period";
import { useMoneyData, LoadState } from "./MoneyWebData";
import { useMoneyViewState, useMoneyCache } from "./MoneyDataProvider";
import { PanelContext } from "./MoneyPanel";
import { MoneyPeriod } from "./MoneyPeriod";
import { MoneyEditor } from "./MoneyEditors";
import {
  BookkeepingView,
  ReviewView,
  SettingsView,
  type Selection,
} from "./MoneyWebViews";
import {
  FinancialOverview as OverviewView,
  FinancialTransactions as TransactionsView,
  FinancialAccounts as AccountsView,
  FinancialLoans as LoansView,
  FlowExplorer,
} from "./MoneyFinancialViews";
import "./money.css";
import "./money-web.css";
import "./money-financial.css";
const menu = [
  ["", "Overview", ChartNoAxesCombined],
  ["transactions", "Transactions", List],
  ["bookkeeping", "가계부", BookOpen],
  ["accounts", "Accounts", Wallet],
  ["loans", "Loans", Landmark],
  ["review", "Review Required", Inbox],
  ["settings", "Settings", Settings],
] as const;
export default function MoneyApp() {
  const cache = useMoneyCache();
  const refresh = () => cache.invalidate();
  const path = usePathname(),
    router = useRouter(),
    shell = useGlobalTabs();
  const rawSection = path.split("/")[2] || "",
    section = rawSection;
  const [period, setPeriod] = useMoneyViewState<Period>("period", () =>
      presetPeriod("month"),
    ),
    [selection, setSelection] = useState<Selection | null>(null);
  const dirty = useRef(false),
    [dirtyVisible, setDirtyVisible] = useState(false);
  const accounts = useMoneyData<Account[]>("/accounts"),
    categories = useMoneyData<Category[]>("/categories");
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
    setDirtyVisible(value);
  }, []);
  const allow = useCallback(
    () =>
      !dirty.current || window.confirm("저장하지 않은 변경사항을 버릴까요?"),
    [],
  );
  useShellNavigationGuard((proceed) => {
    if (allow()) {
      setDirty(false);
      setSelection(null);
      proceed();
    }
  });
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, []);
  const close = () => {
    if (allow()) {
      setDirty(false);
      setSelection(null);
    }
  };
  const select = (s: Selection) => {
    if (
      selection?.kind === s.kind &&
      selection.value?.id &&
      selection.value.id === s.value?.id &&
      JSON.stringify(selection) === JSON.stringify(s)
    )
      return;
    if (allow()) {
      setDirty(false);
      setSelection(s);
    }
  };
  const saved = () => {
    setDirty(false);
    setSelection(null);
    if (selection) cache.mutate(selection.kind);
  };
  const navigate = (url: string) => {
    if (shell) shell.navigate(url);
    else if (allow()) {
      setDirty(false);
      setSelection(null);
      router.push(url);
    }
  };
  const props = {
    accounts: accounts.data || [],
    categories: categories.data || [],
    period,
    ready: !!accounts.data && !!categories.data,
    navigate,
    select,
    selected: selection?.value?.id,
  };
  const title =
    section === "flow"
      ? "Money Flow Explorer"
      : menu.find(([key]) => key === section)?.[1] || "Overview";
  return (
    <PanelContext.Provider value={{ setDirty }}>
      <div
        className={"money-shell money-web " + (selection ? "has-panel" : "")}
      >
        <SharedSidebar
          system="MONEY SYS"
          navigate={navigate}
          groups={[
            {
              section: "MONEY",
              items: menu.map(([key, label, icon]) => ({
                label,
                icon,
                active: section === key,
                destination: "/money" + (key ? "/" + key : ""),
              })),
            },
          ]}
        />
        <main className="money-main">
          <header className="money-header">
            <div>
              <p className="money-eyebrow">MONEY SYS</p>
              <h1>{title}</h1>
              <p className="money-muted">
                {section === "bookkeeping"
                  ? "일상에 의미를 더하는 수입과 지출"
                  : section === "transactions"
                    ? "은행 알림에서 이어지는 금융 원장"
                    : section === "loans"
                      ? "자산과 분리하여 관리하는 부채"
                      : "내 돈의 흐름과 생활을 한눈에"}
              </p>
            </div>
            <div className="money-actions">
              {["", "flow", "transactions", "bookkeeping"].includes(
                section,
              ) && <MoneyPeriod value={period} onChange={setPeriod} />}
              <button
                aria-label="새로고침"
                onClick={() => {
                  if (allow()) {
                    setDirty(false);
                    setSelection(null);
                    refresh();
                  }
                }}
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </header>
          <LoadState
            error={accounts.error || categories.error}
            loading={accounts.loading}
          />
          {section === "" && <OverviewView {...props} />}
          {section === "flow" && <FlowExplorer {...props} />}
          {section === "transactions" && <TransactionsView {...props} />}
          {section === "accounts" && <AccountsView {...props} />}
          {section === "loans" && <LoansView {...props} />}
          {accounts.data && (
            <>
              {!accounts.data.length && (
                <section className="money-onboarding">
                  <div>
                    <h2>MONEY SYS 시작하기</h2>
                    <p>
                      계좌와 시작 잔액을 등록한 뒤 내 돈의 흐름을 확인하세요.
                    </p>
                  </div>
                  <button
                    className="money-primary"
                    onClick={() => select({ kind: "account", value: null })}
                  >
                    계좌 등록
                  </button>
                </section>
              )}
              {section === "bookkeeping" && <BookkeepingView {...props} />}{" "}
              {section === "review" && <ReviewView {...props} />}{" "}
              {section === "settings" && <SettingsView {...props} />}
            </>
          )}
        </main>
        {selection && (
          <>
            <span className="money-dirty" role="status">
              {dirtyVisible ? "저장되지 않은 변경사항" : ""}
            </span>
            <MoneyEditor
              key={
                selection.kind +
                ":" +
                (selection.value?.id || "new") +
                ":" +
                (selection.kind === "account"
                  ? selection.action || ""
                  : selection.kind === "transaction"
                    ? selection.value?.type || ""
                    : "")
              }
              selection={selection}
              accounts={props.accounts}
              categories={props.categories}
              onClose={close}
              onSaved={saved}
              select={select}
            />
          </>
        )}
      </div>
    </PanelContext.Provider>
  );
}
