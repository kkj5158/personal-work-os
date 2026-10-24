/** Seoul civil clock strings are never instants in the browser's timezone. */
export function civilMinute(value: string, date: string) {
  return (Date.parse(`${value}Z`) - Date.parse(`${date}T00:00:00Z`)) / 60000;
}
export function civilDuration(start: string, end: string) {
  return (
    civilMinute(end, start.slice(0, 10)) -
    civilMinute(start, start.slice(0, 10))
  );
}
