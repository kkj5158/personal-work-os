"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { moneyApi, type Account, type Category } from "@/lib/money/model";
import { presetPeriod, type Period } from "@/lib/money/period";
import { DataContext, useMoneyData, LoadState } from "./MoneyWebData";
import { PanelContext } from "./MoneyPanel";
import { MoneyPeriod } from "./MoneyPeriod";
import { MoneyEditor } from "./MoneyEditors";
import {
  OverviewView,
  TransactionsView,
  BookkeepingView,
  AccountsView,
  LoansView,
  ReviewView,
  SettingsView,
  type Selection,
} from "./MoneyWebViews";
import "./money.css";
import "./money-web.css";
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
  const cache = useRef(new Map<string, Promise<unknown>>());
  const [revision, setRevision] = useState(0);
  const get = useCallback(<T,>(path: string): Promise<T> => {
    const existing = cache.current.get(path);
    if (existing) return existing as Promise<T>;
    const request = moneyApi.get<T>(path).catch((e) => {
      cache.current.delete(path);
      throw e;
    });
    cache.current.set(path, request);
    return request;
  }, []);
  const refresh = useCallback(() => {
    cache.current.clear();
    setRevision((v) => v + 1);
  }, []);
  const context = useMemo(() => ({ revision, get }), [revision, get]);
  return (
    <DataContext.Provider value={context}>
      <MoneyWorkspace refresh={refresh} />
    </DataContext.Provider>
  );
}
function MoneyWorkspace({ refresh }: { refresh: () => void }) {
  const path = usePathname(),
    router = useRouter(),
    shell = useGlobalTabs();
  const rawSection = path.split("/")[2] || "",
    section = rawSection === "flow" ? "" : rawSection;
  const [period, setPeriod] = useState<Period>(() => presetPeriod("month")),
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
      selection.value.id === s.value?.id
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
    refresh();
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
    select,
    selected: selection?.value?.id,
  };
  const title = menu.find(([key]) => key === section)?.[1] || "Overview";
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
              {["", "transactions", "bookkeeping"].includes(section) && (
                <MoneyPeriod value={period} onChange={setPeriod} />
              )}
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
            loading={accounts.loading && !accounts.data}
          />
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
              {section === "" && <OverviewView {...props} />}{" "}
              {section === "transactions" && <TransactionsView {...props} />}{" "}
              {section === "bookkeeping" && <BookkeepingView {...props} />}{" "}
              {section === "accounts" && <AccountsView {...props} />}{" "}
              {section === "loans" && <LoansView {...props} />}{" "}
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
              key={selection.kind + ":" + (selection.value?.id || "new")}
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
