import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarCategories, categoryAppearance, EMPTY_PREFERENCES } from "./appearance";

test("LIFE hierarchy inherits Calendar colors from semantic parent", () => {
  const categories = calendarCategories([], [
    {id:"root", name:"운동", parentId:null, sortOrder:0, isActive:true, isDefault:false},
    {id:"child", name:"러닝", parentId:"root", sortOrder:0, isActive:true, isDefault:false},
  ]);
  assert.equal(categories[1].parentId, "root");
  assert.equal(categoryAppearance("LIFE", "child", categories, {
    ...EMPTY_PREFERENCES, colors:{"LIFE:root":"#123456"},
  }).body, "#123456");
});
