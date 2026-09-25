"use client";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Home,
  List,
  GitBranch,
  Inbox,
  Settings,
  Wallet,
  Plus,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { SharedSidebar } from "@/components/Sidebar";
import { useGlobalTabs } from "@/components/GlobalTabs";
import { Button } from "@/components/ui/Button";
import {
  Account,
  AccountBalance,
  AccountDetail,
  Category,
  Rule,
  Transaction,
  Raw,
  Attempt,
  Dashboard,
  Flow,
  moneyApi as api,
  roles,
  kinds,
  providers,
  won,
  accountName,
  currentMonth,
  seoul,
  iso,
  provenance,
  groupAccounts,
  donutSegments,
} from "@/lib/money/model";
import {
  AccountForm,
  EntryForm,
  Dialog,
  Field,
  CategoryOptions,
} from "./MoneyForms";
import "./money.css";
const menu = [
  ["", "Home", Home],
  ["transactions", "Transactions", List],
  ["flow", "Money Flow", GitBranch],
  ["review", "Review Required", Inbox],
  ["settings", "Settings", Settings],
] as const;
export default function MoneyApp() {
  const query = useSearchParams();
  return <MoneyWorkspace key={query.get("month") ?? "current"} />;
}
function MoneyWorkspace() {
  const path = usePathname(),
    query = useSearchParams(),
    router = useRouter(),
    shell = useGlobalTabs();
  const section = path.split("/")[2] ?? "";
  const accountId = section === "accounts" ? path.split("/")[3] : null;
  const [month, setMonth] = useState(query.get("month") ?? currentMonth()),
    [accounts, setAccounts] = useState<AccountBalance[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [dashboard, setDashboard] = useState<Dashboard | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [accountEdit, setAccountEdit] = useState<Account | null | undefined>();
  const nav = (url: string) => (shell ? shell.navigate(url) : router.push(url));
  const reload = () => setRevision((v) => v + 1);
  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<AccountBalance[]>("/account-balances"),
      api.get<Category[]>("/categories"),
      api.get<Dashboard>("/dashboard?month=" + month),
    ])
      .then(([a, c, d]) => {
        if (active) {
          setAccounts(a);
          setCategories(c);
          setDashboard(d);
          setError("");
        }
      })
      .catch(
        (e) =>
          active &&
          setError(
            e instanceof TypeError
              ? "서버에 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 시도하세요."
              : e.message,
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [month, revision]);
  const all = accounts.map((a) => a.account);
  const saved = async (input: unknown) => {
    if (accountEdit)
      await api.put("/accounts/" + accountEdit.id, {
        expectedVersion: accountEdit.version,
        account: input,
      });
    else await api.post("/accounts", input);
    setAccountEdit(undefined);
    reload();
  };
  return (
    <div className="money-shell">
      <SharedSidebar
        system="MONEY SYS"
        navigate={nav}
        groups={[
          {
            section: "MONEY",
            items: menu.map(([key, label, icon]) => ({
              label,
              icon,
              active:
                section === key || (section === "accounts" && key === "flow"),
              destination: "/money" + (key ? "/" + key : ""),
            })),
          },
        ]}
      />
      <main className="money-main">
        <header className="money-header">
          <div>
            <p className="money-eyebrow">MONEY SYS</p>
            <h1>
              {section === "accounts"
                ? "Account Detail"
                : (menu.find(([k]) => k === section)?.[1] ?? "Home")}
            </h1>
            <p className="money-muted">은행 알림에서 시작하는 나의 가계부</p>
          </div>
          <div className="money-actions">
            <label className="money-month">
              조회 월
              <input
                aria-label="조회 월"
                type="month"
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
              />
            </label>
            <Button onClick={reload} aria-label="새로고침">
              <RefreshCw size={16} />
            </Button>
          </div>
        </header>
        {error && (
          <p className="money-error" role="alert">
            {error} <button onClick={reload}>다시 시도</button>
          </p>
        )}
        {loading ? (
          <p role="status">가계부를 불러오는 중…</p>
        ) : error ? null : (
          <>
            {!all.some((a) => !a.archived) && (
              <section className="money-onboarding">
                <Wallet size={28} />
                <div>
                  <h2>MONEY SYS 시작하기</h2>
                  <p>계좌 등록 → 알림 수집 준비 → 새 거래 자동 장부화</p>
                  <p className="money-muted">
                    사용하는 계좌의 알림 힌트와 시작 잔액을 등록하세요. 현금
                    지갑은 선택 사항입니다.
                  </p>
                </div>
                <Button variant="primary" onClick={() => setAccountEdit(null)}>
                  계좌 등록
                </Button>
              </section>
            )}
            {section === "" && dashboard && (
              <HomeView
                dashboard={dashboard}
                categories={categories}
                navigate={nav}
              />
            )}
            {section === "transactions" && (
              <Transactions
                key={month + revision + (query.get("category") ?? "")}
                month={month}
                accounts={all}
                categories={categories}
                category={query.get("category") ?? ""}
                onChange={reload}
              />
            )}
            {section === "flow" && (
              <FlowView
                accounts={accounts}
                flow={dashboard?.flow ?? []}
                navigate={nav}
              />
            )}
            {section === "accounts" && accountId && (
              <AccountView
                key={accountId + month + revision}
                id={accountId}
                month={month}
                accounts={all}
                categories={categories}
                edit={setAccountEdit}
                onChange={reload}
                navigate={nav}
              />
            )}
            {section === "review" && (
              <Review
                key={revision}
                accounts={all}
                categories={categories}
                onChange={reload}
                navigate={nav}
              />
            )}
            {section === "settings" && (
              <SettingsView
                key={revision}
                accounts={accounts}
                categories={categories}
                edit={setAccountEdit}
                onChange={reload}
              />
            )}
          </>
        )}
        {accountEdit !== undefined && (
          <AccountForm
            value={accountEdit}
            accounts={all}
            onSave={saved}
            onClose={() => setAccountEdit(undefined)}
          />
        )}
      </main>
    </div>
  );
}
function Icon({ account }: { account: Account }) {
  return (
    <span className="money-account-icon">
      {account.imageData ? (
        <Image
          unoptimized
          src={account.imageData}
          alt=""
          width={44}
          height={44}
        />
      ) : (
        (account.emoji ?? <Wallet size={21} />)
      )}
    </span>
  );
}
function HomeView({
  dashboard: d,
  categories,
  navigate,
}: {
  dashboard: Dashboard;
  categories: Category[];
  navigate: (url: string) => void;
}) {
  const segments = donutSegments(d.categories);
  const category = (id: string) => categories.find((c) => c.id === id);
  const filter = (id: string) =>
    navigate(`/money/transactions?month=${d.month}${"&category=" + id}`);
  return (
    <>
      <div className="money-metrics">
        {[
          ["이번 달 수입", d.income, "income"],
          ["이번 달 소비", d.consumption, "expense"],
          ["저축 이동", d.savingsMovement, "savings"],
        ].map(([label, value, color]) => (
          <section key={label} className={"money-metric " + color}>
            <p>{label}</p>
            <strong>{won(Number(value))}</strong>
            <span>
              {color === "expense"
                ? "환불 차감 · 내부이체 제외"
                : color === "savings"
                  ? "최종 저축 목적지 순이동"
                  : "외부에서 들어온 수입"}
            </span>
          </section>
        ))}
      </div>
      <section className="money-panel">
        <div className="money-section-head">
          <h2>이번 달 소비</h2>
          <span className="money-muted">카테고리를 선택해 거래 확인</span>
        </div>
        {segments.length ? (
          <div className="money-donut-layout">
            <svg
              className="money-donut"
              viewBox="0 0 200 200"
              role="img"
              aria-label="소비 카테고리 도넛 차트"
            >
              <circle
                cx="100"
                cy="100"
                r="72"
                fill="none"
                stroke="#edf0f3"
                strokeWidth="26"
              />
              {segments.map((s) => (
                <circle
                  key={s.id}
                  cx="100"
                  cy="100"
                  r="72"
                  fill="none"
                  stroke={category(s.id)?.color ?? "#94a3b8"}
                  strokeWidth="26"
                  pathLength="100"
                  strokeDasharray={`${s.percent} ${100 - s.percent}`}
                  strokeDashoffset={-s.offset}
                  transform="rotate(-90 100 100)"
                  role="button"
                  tabIndex={0}
                  aria-label={`${category(s.id)?.name ?? "미분류"} ${won(s.amount)}`}
                  onClick={() => filter(s.id)}
                  onKeyDown={(e) =>
                    (e.key === "Enter" || e.key === " ") && filter(s.id)
                  }
                />
              ))}
              <text x="100" y="96" textAnchor="middle">
                소비 합계
              </text>
              <text
                className="money-donut-total"
                x="100"
                y="118"
                textAnchor="middle"
              >
                {won(d.consumption)}
              </text>
            </svg>
            <div className="money-legend">
              {Object.entries(d.categories).map(([id, amount]) => (
                <button key={id} onClick={() => filter(id)}>
                  <span>
                    <i
                      style={{ background: category(id)?.color ?? "#94a3b8" }}
                    />
                    {category(id)?.name ?? "미분류"}
                  </span>
                  <strong>{won(amount)}</strong>
                  <small>
                    {segments.find((s) => s.id === id)?.percent.toFixed(1) ??
                      "0.0"}
                    %
                  </small>
                </button>
              ))}
              <p className="money-muted">
                도넛 비율은 순소비가 양수인 카테고리 기준입니다. 환불 초과분도
                합계에는 반영됩니다.
              </p>
            </div>
          </div>
        ) : (
          <div className="money-empty">
            아직 이달의 소비가 없습니다.
            <p>새 알림이나 수동 거래가 기록되면 여기에 모입니다.</p>
          </div>
        )}
      </section>
      <button
        className="money-review-banner"
        onClick={() => navigate("/money/review")}
      >
        <Inbox size={24} />
        <span>
          <strong>확인 필요 {d.reviewCount}건</strong>
          <small>
            {d.reviewCount
              ? "계좌, 이체 또는 분류를 확인해주세요."
              : "확인이 필요한 기록이 없습니다."}
          </small>
        </span>
        <ArrowRight size={20} />
      </button>
    </>
  );
}
function AccountCard({
  row,
  compact = false,
  onClick,
}: {
  row: AccountBalance;
  compact?: boolean;
  onClick: () => void;
}) {
  const a = row.account;
  return (
    <button
      className={"money-account-card " + (compact ? "compact" : "")}
      onClick={onClick}
    >
      <Icon account={a} />
      <span>
        <small>{compact ? "" : (providers[a.provider] ?? a.provider)}</small>
        <strong>{a.displayName}</strong>
        <small>
          {compact ? "" : roles[a.role] + " · "}
          {a.suffix ?? a.maskedReference ?? "힌트 없음"}
        </small>
        <b>{won(row.balance.amount)}</b>
      </span>
    </button>
  );
}
function FlowView({
  accounts,
  flow,
  navigate,
}: {
  accounts: AccountBalance[];
  flow: Flow[];
  navigate: (url: string) => void;
}) {
  const groups = groupAccounts(accounts.map((r) => r.account));
  const cards = (list: Account[], compact = false) =>
    list.length ? (
      <div className={compact ? "money-purpose-grid" : "money-account-grid"}>
        {list.map((a) => (
          <AccountCard
            key={a.id}
            row={accounts.find((r) => r.account.id === a.id)!}
            compact={compact}
            onClick={() => navigate("/money/accounts/" + a.id)}
          />
        ))}
      </div>
    ) : (
      <p className="money-muted">등록된 계좌가 없습니다.</p>
    );
  return (
    <>
      <section className="money-structure">
        <div className="money-structure-source">외부 수익 · 급여</div>
        <div className="money-structure-arrow">↓</div>
        <div className="money-hubs">{cards(groups.hubs)}</div>
        <div className="money-axes">
          <section>
            <h2>소비 축</h2>
            <p className="money-muted">생활비 · 고정/정기지출 · 현금</p>
            {cards(groups.spending)}
          </section>
          <section>
            <h2>저축 축</h2>
            {cards(groups.gateways)}
            {groups.gateways.map((g) => (
              <div key={g.id} className="money-purpose-group">
                <h3>{g.displayName} ↓</h3>
                <h4>
                  목적별 저축 <small>중간출금 가능</small>
                </h4>
                {cards(
                  groups.purpose.filter((a) => a.fundingAccountId === g.id),
                  true,
                )}
                <h4>
                  목적별 적금 <small>중간출금 불가</small>
                </h4>
                {cards(
                  groups.installment.filter((a) => a.fundingAccountId === g.id),
                  true,
                )}
              </div>
            ))}
            <div className="money-purpose-group">
              <h3>직접 저축·적금</h3>
              {cards(groups.direct, true)}
            </div>
            {[...groups.purpose, ...groups.installment].some(
              (a) => !groups.gateways.some((g) => g.id === a.fundingAccountId),
            ) && (
              <div className="money-purpose-group">
                <h3>별도 자금 출발 계좌</h3>
                <h4>목적별 저축 · 중간출금 가능</h4>
                {cards(
                  groups.purpose.filter(
                    (a) =>
                      !groups.gateways.some((g) => g.id === a.fundingAccountId),
                  ),
                  true,
                )}
                <h4>목적별 적금 · 중간출금 불가</h4>
                {cards(
                  groups.installment.filter(
                    (a) =>
                      !groups.gateways.some((g) => g.id === a.fundingAccountId),
                  ),
                  true,
                )}
              </div>
            )}
          </section>
        </div>
      </section>
      <FlowSummary flow={flow} accounts={accounts.map((r) => r.account)} />
    </>
  );
}
function FlowSummary({
  flow,
  accounts,
}: {
  flow: Flow[];
  accounts: Account[];
}) {
  const name = (id: string) =>
    accounts.find((a) => a.id === id)
      ? accountName(accounts.find((a) => a.id === id)!)
      : "계좌";
  return (
    <section className="money-panel">
      <h2>이번 달 자금 흐름</h2>
      <p className="money-muted">
        실제 계좌 간 이동입니다. 소비나 저축 달성 합계와 다릅니다.
      </p>
      {flow.length ? (
        flow.map((f) => (
          <div className="money-flow-row" key={f.fromAccountId + f.toAccountId}>
            <span>
              {name(f.fromAccountId)} → {name(f.toAccountId)}
            </span>
            <strong>{won(f.amount)}</strong>
          </div>
        ))
      ) : (
        <p className="money-empty">이달의 계좌 간 이동이 없습니다.</p>
      )}
    </section>
  );
}
function TransactionTable({
  rows,
  accounts,
  categories,
  open,
  selected,
  toggle,
}: {
  rows: Transaction[];
  accounts: Account[];
  categories: Category[];
  open: (t: Transaction) => void;
  selected?: string[];
  toggle?: (id: string) => void;
}) {
  const name = (id: string | null) =>
    accounts.find((a) => a.id === id)?.displayName ?? "외부";
  return (
    <div className="money-table-wrap">
      <table className="money-table">
        <thead>
          <tr>
            {toggle && <th>선택</th>}
            <th>날짜</th>
            <th>거래 / 계좌</th>
            <th>유형</th>
            <th>카테고리</th>
            <th className="money-number">금액</th>
            <th>근거</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className={t.excluded ? "money-excluded" : ""}>
              {toggle && (
                <td>
                  <input
                    aria-label={`${seoul(t.occurredAt)} 거래 선택`}
                    type="checkbox"
                    checked={selected?.includes(t.id)}
                    onChange={() => toggle(t.id)}
                  />
                </td>
              )}
              <td>{seoul(t.occurredAt).replace("T", " ")}</td>
              <td>
                <button className="money-link" onClick={() => open(t)}>
                  <strong>
                    {t.type === "TRANSFER"
                      ? `${name(t.fromAccountId)} → ${name(t.toAccountId)}`
                      : (t.counterpartyText ?? kinds[t.type])}
                  </strong>
                  <small>
                    {t.type === "TRANSFER"
                      ? "내 계좌 간 이동"
                      : name(t.fromAccountId ?? t.toAccountId)}
                    {t.memo ? " · " + t.memo : ""}
                    {t.excluded ? " · 제외됨" : ""}
                  </small>
                </button>
              </td>
              <td>
                <span className={"money-type " + t.type.toLowerCase()}>
                  {kinds[t.type]}
                </span>
              </td>
              <td>
                {categories.find((c) => c.id === t.categoryId)?.name ??
                  (t.type === "EXPENSE" ? "미분류" : "—")}
              </td>
              <td className="money-number">{won(t.amount)}</td>
              <td>{t.sources.length ? `알림 ${t.sources.length}` : "수동"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="money-empty">표시할 거래가 없습니다.</div>
      )}
    </div>
  );
}
function Transactions({
  month,
  accounts,
  categories,
  category = "",
  onChange,
  accountId = "",
}: {
  month: string;
  accounts: Account[];
  categories: Category[];
  category?: string;
  onChange: () => void;
  accountId?: string;
}) {
  const [from, setFrom] = useState(month + "-01"),
    [to, setTo] = useState(
      new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0))
        .toISOString()
        .slice(0, 10),
    ),
    [account, setAccount] = useState(accountId),
    [cat, setCat] = useState(category),
    [type, setType] = useState(""),
    [search, setSearch] = useState(""),
    [excluded, setExcluded] = useState(false),
    [offset, setOffset] = useState(0),
    [rows, setRows] = useState<Transaction[]>([]),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [edit, setEdit] = useState<Partial<Transaction> | null | undefined>(),
    [detail, setDetail] = useState<Transaction | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [bulk, setBulk] = useState(""),
    [busy, setBusy] = useState(false),
    [refunds, setRefunds] = useState<Transaction[]>([]);
  const load = useCallback(async () => {
    const q = new URLSearchParams({
      from,
      to,
      limit: "50",
      offset: String(offset),
      includeExcluded: String(excluded),
    });
    if (account) q.set("accountId", account);
    if (cat === "uncategorized") q.set("uncategorized", "true");
    else if (cat) q.set("categoryId", cat);
    if (type) q.set("type", type);
    if (search) q.set("search", search);
    return api.get<{ items: Transaction[]; total: number }>(
      "/transactions?" + q,
    );
  }, [from, to, account, cat, type, search, excluded, offset]);
  useEffect(() => {
    let current = true;
    load()
      .then((page) => {
        if (current) {
          setRows(page.items);
          setTotal(page.total);
          setError("");
        }
      })
      .catch((e) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, [load]);
  async function startEdit(value: Partial<Transaction> | null) {
    try {
      const list = await api.get<{ items: Transaction[] }>(
        "/transactions?type=EXPENSE&limit=200",
      );
      setRefunds(list.items);
      setEdit(value);
    } catch (e) {
      setError(String(e));
    }
  }
  const save = async (input: Record<string, unknown>) => {
    if (edit?.id) await api.put("/transactions/" + edit.id, input);
    else await api.post("/transactions", input);
    setEdit(undefined);
    setDetail(null);
    onChange();
  };
  return (
    <section>
      <div className="money-section-head">
        <h2>
          {accountId ? "계좌 거래내역" : "거래 장부"} <small>{total}건</small>
        </h2>
        <Button variant="primary" onClick={() => void startEdit(null)}>
          <Plus size={16} /> 수동 추가
        </Button>
      </div>
      <div className="money-filters">
        <Field label="시작일">
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
        <Field label="종료일">
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
        {!accountId && (
          <Field label="계좌">
            <select
              value={account}
              onChange={(e) => {
                setAccount(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">모든 계좌</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountName(a)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="카테고리">
          <select
            value={cat}
            onChange={(e) => {
              setCat(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">전체</option>
            <option value="uncategorized">미분류 소비</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="유형">
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">전체</option>
            {Object.entries(kinds).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="검색">
          <input
            type="search"
            placeholder="거래처 또는 메모"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
      </div>
      <label className="money-check">
        <input
          type="checkbox"
          checked={excluded}
          onChange={(e) => {
            setExcluded(e.target.checked);
            setOffset(0);
          }}
        />
        제외된 거래 포함
      </label>
      {error && <p role="alert">{error}</p>}
      {selected.length > 0 && (
        <div className="money-bulk">
          <strong>{selected.length}건 선택</strong>
          <select
            aria-label="일괄 카테고리"
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
          >
            <CategoryOptions categories={categories} />
          </select>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                for (const t of rows.filter((t) => selected.includes(t.id))) {
                  if (t.type !== "EXPENSE") continue;
                  await api.put("/transactions/" + t.id, {
                    ...t,
                    categoryId: bulk || null,
                    expectedVersion: t.version,
                  });
                }
                setSelected([]);
                onChange();
              } catch (e) {
                setError(String(e));
                const page = await load();
                setRows(page.items);
                setTotal(page.total);
              } finally {
                setBusy(false);
              }
            }}
          >
            소비 카테고리 변경
          </Button>
        </div>
      )}
      <TransactionTable
        rows={rows}
        accounts={accounts}
        categories={categories}
        open={setDetail}
        selected={selected}
        toggle={(id) =>
          setSelected((v) =>
            v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
          )
        }
      />
      <div className="money-pagination">
        <Button
          disabled={!offset}
          onClick={() => {
            setOffset((v) => Math.max(0, v - 50));
            setSelected([]);
          }}
        >
          이전
        </Button>
        <span>
          {total ? offset + 1 : 0}–{Math.min(offset + 50, total)} / {total}
        </span>
        <Button
          disabled={offset + 50 >= total}
          onClick={() => {
            setOffset((v) => v + 50);
            setSelected([]);
          }}
        >
          다음
        </Button>
      </div>
      {detail && (
        <TransactionDetail
          value={detail}
          accounts={accounts}
          edit={(v) => {
            setDetail(null);
            void startEdit(v);
          }}
          onClose={() => setDetail(null)}
          onChange={onChange}
        />
      )}
      {edit !== undefined && (
        <EntryForm
          value={edit}
          accounts={accounts}
          categories={categories}
          refunds={refunds}
          onSave={save}
          onClose={() => setEdit(undefined)}
          title={edit?.id ? "거래 수정" : "수동 거래 추가"}
        />
      )}
    </section>
  );
}
function TransactionDetail({
  value: t,
  accounts,
  edit,
  onClose,
  onChange,
}: {
  value: Transaction;
  accounts: Account[];
  edit: (v: Partial<Transaction>) => void;
  onClose: () => void;
  onChange: () => void;
}) {
  const [raws, setRaws] = useState<Raw[]>([]),
    [history, setHistory] = useState<{ action: string; createdAt: string }[]>(
      [],
    ),
    [options, setOptions] = useState<Transaction[]>([]),
    [other, setOther] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([
      Promise.all(
        t.sources.map((s) => api.get<Raw>("/notifications/" + s.rawEventId)),
      ),
      api.get<{ action: string; createdAt: string }[]>(
        "/transactions/" + t.id + "/corrections",
      ),
      api.get<{ items: Transaction[] }>(
        "/transactions?limit=200&type=" +
          (t.type === "EXPENSE" ? "INCOME" : "EXPENSE"),
      ),
    ])
      .then(([r, h, p]) => {
        setRaws(r);
        setHistory(h);
        setOptions(
          p.items.filter((x) => x.amount === t.amount && x.id !== t.id),
        );
      })
      .catch((e) => setError(e.message));
  }, [t]);
  async function action(path: string, payload: unknown) {
    setBusy(true);
    try {
      await api.post(path, payload);
      onClose();
      onChange();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="거래 상세" onClose={onClose}>
      <p className="money-detail-amount">
        {won(t.amount)} <span className="money-type">{kinds[t.type]}</span>
      </p>
      <p>{seoul(t.occurredAt).replace("T", " ")} · 한국 시간</p>
      <p>{t.counterpartyText}</p>
      <p>{t.memo}</p>
      <div className="money-actions">
        <Button onClick={() => edit(t)} disabled={!!t.mergedInto}>
          거래 수정 / 제외
        </Button>
        {t.type === "EXPENSE" && !t.excluded && (
          <Button
            onClick={() =>
              edit({
                type: "REFUND",
                toAccountId: t.fromAccountId,
                refundOf: t.id,
                amount: t.amount,
                categoryId: t.categoryId,
              })
            }
          >
            환불 기록 연결
          </Button>
        )}
      </div>
      <h3>알림 근거 · 읽기 전용</h3>
      {raws.map((r) => (
        <details key={r.id}>
          <summary>
            {r.sourcePackage} · {seoul(r.postedAt).replace("T", " ")}
          </summary>
          <pre>
            {[r.title, r.text, r.bigText !== r.text ? r.bigText : null]
              .filter(Boolean)
              .join("\n")}
          </pre>
          <small>{r.id}</small>
        </details>
      ))}
      {!t.sources.length && <p className="money-muted">수동 기록입니다.</p>}
      {history.length > 0 && (
        <details>
          <summary>수정 이력 {history.length}건</summary>
          {history.map((h, i) => (
            <p key={i}>
              {seoul(h.createdAt).replace("T", " ")} · {h.action}
            </p>
          ))}
        </details>
      )}
      {!t.excluded && (t.type === "EXPENSE" || t.type === "INCOME") && (
        <details>
          <summary>두 거래를 내부이체로 연결</summary>
          <p>금액이 같은 반대 방향 거래를 직접 확인해 선택하세요.</p>
          <select
            aria-label="연결할 거래"
            value={other}
            onChange={(e) => setOther(e.target.value)}
          >
            <option value="">거래 선택</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {seoul(o.occurredAt).replace("T", " ")} ·{" "}
                {
                  accounts.find(
                    (a) => a.id === (o.fromAccountId ?? o.toAccountId),
                  )?.displayName
                }{" "}
                · {o.counterpartyText}
              </option>
            ))}
          </select>
          <Button
            disabled={busy || !other}
            onClick={() =>
              void action("/transactions/" + t.id + "/link-transfer", {
                otherId: other,
                expectedVersion: t.version,
                otherVersion: options.find((o) => o.id === other)?.version,
              })
            }
          >
            내부이체로 확정
          </Button>
        </details>
      )}
      {t.type === "TRANSFER" && !t.excluded && (
        <details>
          <summary>이체 연결 해제</summary>
          <p>
            소비와 수입으로 분리되며 통계가 바뀝니다. 원본 알림은 기존 출금
            기록의 근거와 수정 이력에 보존됩니다.
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              void action("/transactions/" + t.id + "/unlink-transfer", {
                expectedVersion: t.version,
              })
            }
          >
            소비 + 수입으로 분리
          </Button>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
    </Dialog>
  );
}
function AccountView({
  id,
  month,
  accounts,
  categories,
  edit,
  onChange,
  navigate,
}: {
  id: string;
  month: string;
  accounts: Account[];
  categories: Category[];
  edit: (a: Account) => void;
  onChange: () => void;
  navigate: (s: string) => void;
}) {
  const [data, setData] = useState<AccountDetail | null>(null),
    [error, setError] = useState(""),
    [adjust, setAdjust] = useState(false),
    [amount, setAmount] = useState(""),
    [at, setAt] = useState(seoul(new Date().toISOString())),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .get<AccountDetail>("/accounts/" + id + "/detail?month=" + month)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id, month]);
  if (!data)
    return (
      <p role={error ? "alert" : "status"}>{error || "계좌 불러오는 중…"}</p>
    );
  return (
    <>
      <button className="money-link" onClick={() => navigate("/money/flow")}>
        ← Money Flow
      </button>
      <section className="money-account-detail">
        <Icon account={data.account} />
        <div>
          <h2>{accountName(data.account)}</h2>
          <p>
            {roles[data.account.role]} ·{" "}
            {data.account.suffix ??
              data.account.maskedReference ??
              "힌트 미등록"}
            {data.account.archived ? " · 보관됨" : ""}
          </p>
          <strong>{won(data.balance.amount)}</strong>
          <p className="money-muted">
            {provenance(data.balance)}
            {data.balance.asOf
              ? " · " + seoul(data.balance.asOf).replace("T", " ")
              : ""}
          </p>
        </div>
        <div className="money-actions">
          <Button onClick={() => edit(data.account)}>계좌 수정</Button>
          <Button
            onClick={() => {
              setAmount(String(data.balance.amount));
              setAdjust(true);
            }}
          >
            잔액 확인 / 보정
          </Button>
        </div>
      </section>
      <div className="money-metrics">
        <section className="money-metric">
          <p>이번 달 입금</p>
          <strong>{won(data.inflow)}</strong>
        </section>
        <section className="money-metric">
          <p>이번 달 출금</p>
          <strong>{won(data.outflow)}</strong>
        </section>
      </div>
      <p className="money-muted">
        계좌 입출금에는 내부이체도 포함됩니다. 가계 전체 수입·소비와 다릅니다.
      </p>
      <FlowSummary flow={data.counterparties} accounts={accounts} />
      <details className="money-panel">
        <summary>잔액 확인 이력 {data.checkpoints.length}건</summary>
        {data.checkpoints.map((c) => (
          <p key={c.id}>
            {seoul(c.verifiedAt).replace("T", " ")} · {won(c.amount)} · {c.note}
          </p>
        ))}
      </details>
      <Transactions
        month={month}
        accounts={accounts}
        categories={categories}
        accountId={id}
        onChange={onChange}
      />
      {adjust && (
        <Dialog
          title="잔액 확인 / 기준점 보정"
          onClose={() => !busy && setAdjust(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api.post("/accounts/" + id + "/balance-checkpoints", {
                  amount: Number(amount),
                  verifiedAt: iso(at),
                  note: note || null,
                  expectedVersion: data.account.version,
                });
                setAdjust(false);
                onChange();
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              실제 확인한 잔액을 기준점으로 저장합니다. 수입이나 소비 거래를
              만들지 않습니다.
            </p>
            <Field label="실제 잔액">
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="확인 시각 · 한국 시간">
              <input
                required
                type="datetime-local"
                value={at}
                onChange={(e) => setAt(e.target.value)}
              />
            </Field>
            <Field label="메모">
              <input
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            {error && <p role="alert">{error}</p>}
            <footer>
              <Button variant="primary" type="submit" disabled={busy}>
                기준점 저장
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
    </>
  );
}
function Review({
  accounts,
  categories,
  onChange,
  navigate,
}: {
  accounts: Account[];
  categories: Category[];
  onChange: () => void;
  navigate: (url: string) => void;
}) {
  const [data, setData] = useState<{
      raw: Raw[];
      uncategorized: Transaction[];
      total: number;
      balanceIssues: {
        accountId: string;
        expectedBalance: number;
        observedBalance: number;
        difference: number;
      }[];
    } | null>(null),
    [raw, setRaw] = useState<Raw | null>(null),
    [attempts, setAttempts] = useState<Attempt[]>([]),
    [pair, setPair] = useState(""),
    [edit, setEdit] = useState<Partial<Transaction> | undefined>(),
    [editingTx, setEditingTx] = useState(false),
    [offset, setOffset] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .get<typeof data>("/review?limit=50&offset=" + offset)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [offset]);
  async function select(r: Raw) {
    setRaw(r);
    setPair("");
    try {
      setAttempts(
        await api.get<Attempt[]>("/notifications/" + r.id + "/parse-attempts"),
      );
    } catch (e) {
      setError(String(e));
    }
  }
  async function resolve(action: string) {
    if (!raw) return;
    setBusy(true);
    try {
      await api.post("/notifications/" + raw.id + "/" + action, {
        expectedVersion: raw.processingVersion,
      });
      onChange();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const reasons: Record<string, string> = {
    ACCOUNT_RESOLUTION_REQUIRED: "계좌 확인",
    AMBIGUOUS_TRANSFER: "이체 후보 확인",
    NO_SAFE_INTERPRETATION: "거래 해석 확인",
    UNRECOGNIZED_SHAPE: "은행 / 알림 형식 확인",
    PARSER_ERROR: "해석 재시도",
    UNMATCHED: "이체 또는 외부거래 확인",
  };
  return (
    <>
      <p className="money-muted">
        확신할 수 없는 기록만 여기에 모입니다. 모호하면 그대로 남겨두세요. 잔액
        확인은 계좌 상세에서 진행합니다.
      </p>
      {error && <p role="alert">{error}</p>}
      {data?.total === 0 && (
        <section className="money-empty">
          <CheckCircle2 />
          <h2>확인이 필요한 기록이 없습니다.</h2>
        </section>
      )}
      <div className="money-review-layout">
        <section className="money-panel">
          {!!data?.balanceIssues.length && (
            <>
              <h2>잔액 확인</h2>
              {data.balanceIssues.map((issue) => (
                <button
                  className="money-review-row"
                  key={issue.accountId}
                  onClick={() => navigate("/money/accounts/" + issue.accountId)}
                >
                  <strong>
                    {
                      accounts.find((a) => a.id === issue.accountId)
                        ?.displayName
                    }
                  </strong>
                  <span>
                    계산 {won(issue.expectedBalance)} · 알림 기준{" "}
                    {won(issue.observedBalance)}
                  </span>
                  <small>
                    차이 {won(issue.difference)} · 계좌 상세에서 확인
                  </small>
                </button>
              ))}
            </>
          )}
          <h2>알림 확인</h2>
          {data?.raw.map((r) => (
            <button
              className={
                "money-review-row " + (raw?.id === r.id ? "selected" : "")
              }
              key={r.id}
              onClick={() => void select(r)}
            >
              <span>
                {reasons[r.processingReason ?? ""] ?? "거래 확인 필요"}
              </span>
              <strong>{r.title ?? "제목 없음"}</strong>
              <small>
                {r.sourcePackage} · {seoul(r.postedAt).replace("T", " ")}
              </small>
            </button>
          ))}
          <h2>소비 카테고리 확인</h2>
          {data?.uncategorized.map((t) => (
            <button
              className="money-review-row"
              key={t.id}
              onClick={() => {
                setEditingTx(true);
                setEdit(t);
              }}
            >
              {t.counterpartyText ?? "소비"} · {won(t.amount)}
            </button>
          ))}
          <div className="money-pagination">
            <Button
              disabled={!offset}
              onClick={() => setOffset((v) => Math.max(0, v - 50))}
            >
              이전
            </Button>
            <Button
              disabled={
                !data ||
                (data.raw.length < 50 && data.uncategorized.length < 50)
              }
              onClick={() => setOffset((v) => v + 50)}
            >
              다음
            </Button>
          </div>
        </section>
        <section className="money-panel">
          {raw ? (
            <>
              <h2>{raw.title ?? "알림 확인"}</h2>
              <p className="money-muted">원본 · 읽기 전용</p>
              <pre>{raw.bigText ?? raw.text ?? "본문 없음"}</pre>
              <p>{raw.processingReason}</p>
              {attempts.map((a) => (
                <details key={a.id}>
                  <summary>
                    {a.parserKey} {a.parserVersion} · {a.status}
                  </summary>
                  <p>
                    {a.candidate
                      ? `${a.candidate.direction === "IN" ? "입금" : "출금"} · ${won(a.candidate.amount)} · ${a.candidate.sourceAccountHint ?? ""} → ${a.candidate.destinationAccountHint ?? ""}`
                      : "자동 해석되지 않았습니다. 원본을 보고 확인해주세요."}
                  </p>
                </details>
              ))}
              <Field label="이체의 다른 알림 (선택)">
                <select value={pair} onChange={(e) => setPair(e.target.value)}>
                  <option value="">현재 알림만 사용</option>
                  {data?.raw
                    .filter((r) => r.id !== raw.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title} · {r.sourcePackage} · {seoul(r.postedAt)}
                      </option>
                    ))}
                </select>
              </Field>
              <div className="money-actions">
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => {
                    const c = attempts.at(-1)?.candidate;
                    setEditingTx(false);
                    setEdit({
                      type: pair
                        ? "TRANSFER"
                        : c?.direction === "IN"
                          ? "INCOME"
                          : "EXPENSE",
                      amount: c?.amount,
                      occurredAt: c?.occurredAt ?? raw.postedAt,
                      counterpartyText: c?.counterpartyText,
                    });
                  }}
                >
                  계좌 / 거래 의미 지정
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void resolve("reprocess")}
                >
                  계좌 설정 후 다시 해석
                </Button>
              </div>
              <details>
                <summary>중복 / 보조 알림으로 제외</summary>
                <p>
                  금융 거래가 아닌지 확인 후 제외하세요. 원본은 보존되며 자동
                  처리되지 않습니다.
                </p>
                <Button disabled={busy} onClick={() => void resolve("exclude")}>
                  이 알림 장부에서 제외
                </Button>
              </details>
              <button className="money-link" onClick={() => setRaw(null)}>
                미해결로 남기기
              </button>
            </>
          ) : (
            <p className="money-empty">확인할 기록을 선택하세요.</p>
          )}
        </section>
      </div>
      {edit && (
        <EntryForm
          value={edit}
          accounts={accounts}
          categories={categories}
          refunds={[]}
          title="기록 확인"
          onClose={() => setEdit(undefined)}
          onSave={async (input) => {
            if (editingTx && edit.id)
              await api.put("/transactions/" + edit.id, input);
            else if (raw) {
              const other = data?.raw.find((r) => r.id === pair);
              await api.post("/review/confirm", {
                transaction: input,
                rawIds: other ? [raw.id, other.id] : [raw.id],
                expectedVersions: other
                  ? [raw.processingVersion, other.processingVersion]
                  : [raw.processingVersion],
              });
            }
            setEdit(undefined);
            onChange();
          }}
        />
      )}
    </>
  );
}
function SettingsView({
  accounts,
  categories,
  edit,
  onChange,
}: {
  accounts: AccountBalance[];
  categories: Category[];
  edit: (a: Account | null) => void;
  onChange: () => void;
}) {
  const [tab, setTab] = useState("accounts"),
    [rules, setRules] = useState<Rule[]>([]),
    [status, setStatus] = useState<{
      server: string;
      lastReceivedAt: string | null;
      pending: number;
      bridge: string;
    } | null>(null),
    [categoryEdit, setCategoryEdit] = useState<Category | null | undefined>(),
    [name, setName] = useState(""),
    [color, setColor] = useState("#668bb5"),
    [merchant, setMerchant] = useState(""),
    [category, setCategory] = useState(""),
    [ruleEdit, setRuleEdit] = useState<Rule | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([
      api.get<Rule[]>("/category-rules"),
      api.get<typeof status>("/connection-status"),
    ])
      .then(([r, s]) => {
        setRules(r);
        setStatus(s);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="money-tabs">
        {[
          ["accounts", "계좌"],
          ["categories", "카테고리"],
          ["rules", "자동분류 규칙"],
          ["connection", "연결 상태"],
        ].map(([k, v]) => (
          <button
            key={k}
            aria-current={tab === k ? "page" : undefined}
            onClick={() => setTab(k)}
          >
            {v}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {tab === "accounts" && (
        <>
          <div className="money-section-head">
            <h2>내 계좌</h2>
            <Button variant="primary" onClick={() => edit(null)}>
              계좌 등록
            </Button>
          </div>
          {accounts.map((r) => (
            <section className="money-settings-account" key={r.account.id}>
              <Icon account={r.account} />
              <div>
                <strong>{accountName(r.account)}</strong>
                <p>
                  {roles[r.account.role]} ·{" "}
                  {r.account.suffix ?? r.account.maskedReference ?? "힌트 없음"}{" "}
                  · {won(r.balance.amount)}
                  {r.account.archived ? " · 보관됨" : ""}
                </p>
              </div>
              <Button onClick={() => edit(r.account)}>수정</Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void action(() =>
                    api.put("/accounts/" + r.account.id + "/archive", {
                      expectedVersion: r.account.version,
                      archived: !r.account.archived,
                    }),
                  )
                }
              >
                {r.account.archived ? "다시 활성화" : "보관"}
              </Button>
            </section>
          ))}
        </>
      )}
      {tab === "categories" && (
        <section className="money-panel">
          <div className="money-section-head">
            <h2>소비 카테고리</h2>
            <div className="money-actions">
              <Button
                disabled={busy}
                onClick={() =>
                  void action(() => api.post("/categories/defaults", {}))
                }
              >
                기본 카테고리 추가
              </Button>
              <Button
                onClick={() => {
                  setName("");
                  setColor("#668bb5");
                  setCategoryEdit(null);
                }}
              >
                새 카테고리
              </Button>
            </div>
          </div>
          {categories.map((c) => (
            <div className="money-flow-row" key={c.id}>
              <span>
                <i className="money-dot" style={{ background: c.color }} />
                {c.name}
                {c.archived ? " · 보관됨" : ""}
              </span>
              <div className="money-actions">
                <Button
                  onClick={() => {
                    setName(c.name);
                    setColor(c.color);
                    setCategoryEdit(c);
                  }}
                >
                  수정
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void action(() =>
                      api.put("/categories/" + c.id, {
                        ...c,
                        archived: !c.archived,
                        expectedVersion: c.version,
                      }),
                    )
                  }
                >
                  {c.archived ? "복원" : "보관"}
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}
      {tab === "rules" && (
        <section className="money-panel">
          <h2>명시적 자동분류 규칙</h2>
          <p className="money-muted">
            거래처 텍스트가 정확히 일치하는 새 소비에 적용합니다. 한 번의
            수정으로 규칙을 자동 생성하지 않습니다.
          </p>
          <form
            className="money-rule-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action(() =>
                ruleEdit
                  ? api.put("/category-rules/" + ruleEdit.id, {
                      merchant,
                      categoryId: category,
                      expectedVersion: ruleEdit.version,
                    })
                  : api.post("/category-rules", {
                      merchant,
                      categoryId: category,
                    }),
              );
            }}
          >
            <Field label="거래처">
              <input
                required
                maxLength={500}
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
              />
            </Field>
            <Field label="카테고리">
              <select
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <CategoryOptions categories={categories} />
              </select>
            </Field>
            <Button type="submit" disabled={busy}>
              규칙 {ruleEdit ? "수정" : "추가"}
            </Button>
            {ruleEdit && (
              <Button
                onClick={() => {
                  setRuleEdit(null);
                  setMerchant("");
                  setCategory("");
                }}
              >
                취소
              </Button>
            )}
          </form>
          {rules.map((r) => (
            <div className="money-flow-row" key={r.id}>
              <span>
                {r.merchant} →{" "}
                {categories.find((c) => c.id === r.categoryId)?.name}
              </span>
              <div className="money-actions">
                <Button
                  onClick={() => {
                    setRuleEdit(r);
                    setMerchant(r.merchant);
                    setCategory(r.categoryId);
                  }}
                >
                  수정
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void action(() =>
                      api.delete(
                        "/category-rules/" +
                          r.id +
                          "?expectedVersion=" +
                          r.version,
                      ),
                    )
                  }
                >
                  삭제
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}
      {tab === "connection" && (
        <section className="money-panel">
          <h2>연결 / 수집 상태</h2>
          <dl className="money-status">
            <dt>POS 서버</dt>
            <dd>{status?.server === "CONNECTED" ? "연결됨" : "확인 중"}</dd>
            <dt>마지막 알림 수신</dt>
            <dd>
              {status?.lastReceivedAt
                ? seoul(status.lastReceivedAt).replace("T", " ")
                : "아직 수신된 알림이 없습니다."}
            </dd>
            <dt>처리 대기</dt>
            <dd>{status?.pending ?? 0}건</dd>
          </dl>
          <p className="money-muted">{status?.bridge}</p>
          <p>
            휴대폰에서 알림 접근 권한, 은행 앱 허용 목록, 전송 설정을
            확인하세요. 웹에서 알림 접근 권한을 설정할 수는 없습니다.
          </p>
        </section>
      )}
      {categoryEdit !== undefined && (
        <Dialog title="카테고리" onClose={() => setCategoryEdit(undefined)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(() =>
                categoryEdit
                  ? api.put("/categories/" + categoryEdit.id, {
                      name,
                      color,
                      archived: categoryEdit.archived,
                      expectedVersion: categoryEdit.version,
                    })
                  : api.post("/categories", { name, color, archived: false }),
              );
            }}
          >
            <Field label="이름">
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="색상">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </Field>
            <footer>
              <Button type="submit" variant="primary" disabled={busy}>
                저장
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
    </>
  );
}
