"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChartNoAxesCombined,
  List,
  BookOpen,
  Wallet,
  Landmark,
  Inbox,
  Settings,
  Tags,
  RefreshCw,
  ArrowLeftRight,
  Sparkles,
} from "lucide-react";
import { SharedSidebar } from "@/components/Sidebar";
import {
  useGlobalTabs,
  useShellNavigationGuard,
} from "@/components/GlobalTabs";
import { type Account, type Category } from "@/lib/money/model";
import { presetPeriod, type Period } from "@/lib/money/period";
import { useMoneyData, LoadState } from "./MoneyWebData";
import { useMoneyViewState, useMoneyCache, useMoneyScrollCapture } from "./MoneyDataProvider";
import { PanelContext, MoneyIdlePanel } from "./MoneyPanel";
import { MoneyPeriod } from "./MoneyPeriod";
import { MoneyEditor } from "./MoneyEditors";
import {RevisionAccountPanel} from './MoneyAccountRevision';
import { type Selection } from "./MoneyWebViews";
import {
  FinancialOverview as OverviewView,
  FinancialTransactions as TransactionsView,
  FinancialAccounts as AccountsView,
  FinancialLoans as LoansView,
  FinancialReconciliation as ReconciliationView,
  FlowExplorer,
} from "./MoneyFinancialViews";
import { Bookkeeping as BookkeepingView } from "./MoneyBookkeeping";
import { ReviewWorkbench as ReviewView } from "./MoneyReviewWorkbench";
import { Classification } from "./MoneyClassification";
import { SystemSettings as SettingsView } from "./MoneySystemSettings";
import "./money-meaning.css";
import "./money.css";
import "./money-web.css";
import "./money-financial.css";
import "./money-revision.css";
import "./money-navigation.css";
const menu = [
  ["", "개요", ChartNoAxesCombined],
  ["transactions", "거래 내역", List],
  ["bookkeeping", "가계부", BookOpen],
  ["workbench", "AI 분류 작업대", Sparkles],
  ["accounts", "계좌", Wallet],
  ["reconciliation", "잔액 점검", ArrowLeftRight],
  ["loans", "대출", Landmark],
  ["analysis", "통계 / AI 분석", ChartNoAxesCombined],
  ["review", "검토 필요", Inbox],
  ["classification", "분류 · 규칙", Tags],
  ["settings", "설정", Settings],
] as const;
const menuGroups = [
  { section: "01 · Review & Classification", keys: ["review", "workbench", "classification"] },
  { section: "02 · Transactions & Ledger", keys: ["transactions", "bookkeeping"] },
  { section: "03 · Financial Management", keys: ["accounts", "reconciliation", "loans"] },
  { section: "04 · Overview & Analytics", keys: ["", "analysis"] },
  { section: "설정", keys: ["settings"], bottom: true },
];
export default function MoneyApp() {
  const cache = useMoneyCache();
  const captureScroll=useMoneyScrollCapture();
  const refresh = () => cache.invalidate();
  const path = usePathname(),
    router = useRouter(),
    shell = useGlobalTabs();
  const query = useSearchParams();
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
      captureScroll();
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
  const reviewWithoutPanel = section === "review" && query.get("ai") !== "transfers";
  // Bookkeeping and the dedicated transfer workflow retain their existing detail panels.
  const workbench = ["bookkeeping","workbench"].includes(section) || section === "review" && !reviewWithoutPanel;
  const [classificationTab] = useMoneyViewState("classification-tab",()=>"categories");
  const categoryManagement=section==="classification"&&!query.get("ai")&&["categories","rules"].includes(classificationTab);
  const idlePanel = categoryManagement || ["transactions","accounts","loans"].includes(section);
  const [advance, setAdvance] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  const [drawer,setDrawer]=useState(true);
  useEffect(()=>{const node=mainRef.current;if(!node)return;const observer=new ResizeObserver(()=>{const style=getComputedStyle(node);setDrawer(node.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)<(["bookkeeping","workbench","review","classification"].includes(section)?1200:section==="accounts"?900:1280));});observer.observe(node);return()=>observer.disconnect();},[section]);
  const modalPanel=drawer;
  const clearSelection=useCallback(()=>{if(!dirty.current)setSelection(null);},[]);

  const saved = () => {
    setDirty(false);
    setSelection(null);
    if (workbench) setAdvance((n) => n + 1);
    if (selection)
      cache.mutate(
        selection.kind === "reconciliation" ? "account" : selection.kind === "reviewItem" &&
          selection.value.kind === "TRANSACTION"
          ? "reviewMeaning"
          : selection.kind,
      );
  };
  const navigate = (url: string) => {
    if (shell) shell.navigate(url);
    else if (allow()) {
      captureScroll();
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
    changeContext: () => {
      if (!allow()) return false;
      setDirty(false);
      setSelection(null);
      return true;
    },
    select,
    clearSelection,
    selected: selection?.value?.id,
    advance,
  };
  const title =
    section === "flow"
      ? "자금 흐름"
      : menu.find(([key]) => key === section)?.[1] || "개요";
  return (
    <PanelContext.Provider value={{ setDirty, drawer:modalPanel }}>
      <div
        className={
          "money-shell money-web money-revision " + (modalPanel?"money-drawer-mode ":"money-rail-mode ") +
          (selection && !reviewWithoutPanel ? "has-panel" : idlePanel ? "has-idle-panel" : "")
        }
      >
        <SharedSidebar
          system="MONEY SYS"
          navigate={navigate}
          groups={menuGroups.map(group => ({
              section: group.section,
              collapsible: !group.bottom,
              bottom: group.bottom,
              items: group.keys.map(key => {
                const [, label, icon] = menu.find(item => item[0] === key)!;
                return {
                label,
                icon,
                active: section === key,
                destination: "/money" + (key ? "/" + key : ""),
                };
              }),
          }))}
        />
        <main ref={mainRef} className="money-main" data-section={section}>
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
              {["", "flow", "transactions", "bookkeeping", "workbench"].includes(
                section,
              ) && <MoneyPeriod value={period} onChange={setPeriod} />}
              <button
                aria-label="새로고침"
                onClick={refresh}
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </header>
          <LoadState
            hideLastChecked={section === "accounts"}
            error={accounts.error || categories.error}
            loading={accounts.loading}
          />
          <div className={"money-workspace "+(idlePanel||selection&&!reviewWithoutPanel?"persistent":"")}><div className="money-workspace-list">
          {section === "" && <OverviewView {...props} />}
          {section === "flow" && <FlowExplorer {...props} />}
          {section === "transactions" && <TransactionsView {...props} />}
          {section === "accounts" && <AccountsView {...props} />}
          {section === "loans" && <LoansView {...props} />}
          {section === "reconciliation" && <ReconciliationView {...props} />}
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
                    onClick={() => reviewWithoutPanel ? navigate('/money/accounts') : select({ kind: "account", value: null })}
                  >
                    계좌 등록
                  </button>
                </section>
              )}
              {section === "bookkeeping" && <BookkeepingView {...props} />}{" "}
              {section === "workbench" && <BookkeepingView {...props} mode="workbench" />}
              {section === "analysis" && <section className="money-card money-analysis-boundary"><h2>통계 / AI 분석</h2><p>기간 비교 · 장기 추이 · 소비 패턴 · AI 인사이트</p><p className="money-muted">월간 가계부는 해당 월의 거래 관리에 집중합니다. 장기 통계와 AI 분석의 상세 기능은 후속 기획에서 제공합니다.</p><button onClick={()=>navigate('/money/bookkeeping')}>월간 가계부로 이동</button></section>}
              {section === "review" && <ReviewView {...props} />}{" "}
              {section === "classification" && <Classification {...props} />}
              {section === "settings" && <SettingsView />}
            </>
          )}
        </div>
        {!reviewWithoutPanel && <div className="money-detail-host">
        {!selection && idlePanel && (
          <MoneyIdlePanel
            title={section === "accounts"?"계좌 상세":section==="loans"?"대출 상세":section==="classification"?"분류 정보":"거래 상세"}
            text={
              section === "review"
                ? "목록에서 항목을 선택하면 근거와 처리 방법이 이곳에 표시됩니다. 목록과 필터는 그대로 유지됩니다."
                : "목록에서 항목을 선택하면 상세와 근거가 이곳에 표시됩니다. 선택 전에도 같은 폭과 위치를 유지합니다."
            }
          />
        )}
        {selection && (
          <>
            <span className="money-dirty" role="status">
              {dirtyVisible ? "저장되지 않은 변경사항" : ""}
            </span>
            {modalPanel&&<button className="money-drawer-backdrop" aria-label="상세 패널 닫기" onClick={close}/>}
            {section==='accounts'&&selection.kind==='account'&&!selection.action?<RevisionAccountPanel
              key={'account:'+ (selection.value?.id||'new')}
              value={selection.value}
              selection={selection}
              navigate={navigate}
              accounts={props.accounts}
              categories={props.categories}
              onClose={close}
              onSaved={()=>{setDirty(false);cache.mutate('account');}}
              select={select}
            />:<MoneyEditor
              key={
                selection.kind +
                ":" +
                (selection.value?.id || "new") +
                ":" +
                (selection.kind === "account"
                  ? (selection.action || "") + (selection.edit?"edit":"read")
                  : selection.kind === "loan" ? (selection.edit?"edit":"read")
                  : selection.kind === "transaction"
                    ? selection.value?.type || ""
                    : "")
              }
              navigate={navigate}
              selection={selection}
              accounts={props.accounts}
              categories={props.categories}
              onClose={close}
              onSaved={saved}
              select={select}
            />}
          </>
        )}
        </div>}</div>
        </main>
      </div>
    </PanelContext.Provider>
  );
}
