import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarCategories, categoryAppearance } from "./appearance";

test("LIFE hierarchy inherits Calendar colors from semantic parent", () => {
  const categories = calendarCategories([], [
    {id:"root", name:"운동", parentId:null, sortOrder:0, isActive:true, isDefault:false, color:"#123456"},
    {id:"child", name:"러닝", parentId:"root", sortOrder:0, isActive:true, isDefault:false},
  ]);
  assert.equal(categories[1].parentId, "root");
  assert.equal(categoryAppearance("LIFE", "child", categories).body, "#123456");
});
