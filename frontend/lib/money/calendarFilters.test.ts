import assert from "node:assert/strict";
import { test } from "node:test";
import type { Category } from "./model";
import { calendarCategorySelected, toggleCalendarCategory } from "./calendarFilters";
import { calendarDestination } from "./calendarPresentation";
const categories = [{ id: "salary", name: "급여", parentId: null }, { id: "base", name: "기본급", parentId: "salary" }, { id: "bonus", name: "상여", parentId: "salary" }, { id: "other", name: "기타 수입", parentId: null }] as Category[];

test("calendar income categories isolate from all, include descendants and narrow one sibling exactly", () => {
  assert.deepEqual(toggleCalendarCategory(categories, null, "salary"), ["salary"]);
  assert.equal(calendarCategorySelected(categories, ["salary"], "base"), true);
  assert.equal(calendarCategorySelected(categories, ["salary"], "direct:salary"), true);
  const narrowed = toggleCalendarCategory(categories, ["salary"], "bonus");
  assert.deepEqual(narrowed, ["direct:salary", "base"]);
  assert.equal(calendarCategorySelected(categories, narrowed, "salary"), false);
  assert.deepEqual(toggleCalendarCategory(categories, narrowed, "salary"), ["salary"]);
  assert.deepEqual(toggleCalendarCategory(categories, ["salary"], "salary"), []);
});
test("multiple roots, direct buckets and uncategorized are independent read-only wire selections", () => {
  assert.deepEqual(toggleCalendarCategory(categories, ["salary"], "other"), ["salary", "other"]);
  assert.deepEqual(toggleCalendarCategory(categories, null, "base"), ["base"]);
  assert.deepEqual(toggleCalendarCategory(categories, null, "direct:salary"), ["direct:salary"]);
  assert.deepEqual(toggleCalendarCategory(categories, ["base"], "uncategorized"), ["base", "uncategorized"]);
  assert.deepEqual(toggleCalendarCategory(categories, ["uncategorized"], "uncategorized"), []);
  assert.equal(calendarCategorySelected(categories, null, "base"), false);
  assert.equal(calendarCategorySelected(categories, ["base"], "bonus"), false);
});
test("spending destination prefers structured merchant and rejects generic titles, bank labels and package identifiers", () => {
  assert.equal(calendarDestination({ counterpartyText: "씨유 역삼점", title: "입출금내역 알림" }), "씨유 역삼점");
  assert.equal(calendarDestination({ counterpartyText: null, title: "교보문고 도서 구입" }), "교보문고 도서 구입");
  for (const value of [null, "입출금내역 알림", "카카오뱅크 알림", "com.kakaobank.channel"]) assert.equal(calendarDestination({ counterpartyText: value, title: "입출금내역 알림" }), "거래처 미확인");
  for (const title of ["입출금내역(문자)", "[입출금내역]", "출금 알림: 완료"]) assert.equal(calendarDestination({ counterpartyText: null, title }), "거래처 미확인");
  const original = { counterpartyText: "스타벅스", title: "입출금내역 알림" }, before = structuredClone(original);
  calendarDestination(original); assert.deepEqual(original, before);
});
