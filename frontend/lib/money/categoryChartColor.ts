import type {Category} from './model';
/** Stored L3 color wins. Absent colors retain the existing chart palette fallback. */
export function categoryChartColor(id:string,categories:Category[],fallback:string) {
  const category=categories.find(c=>c.id===id.replace(/^direct:/,''));
  return category?.color || fallback;
}
