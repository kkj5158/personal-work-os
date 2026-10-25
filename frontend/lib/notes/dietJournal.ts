/** Compare journal edits independently of the DIET dashboard's derived snapshot. */
export function withoutDietDashboard(content: string): string {
  return content.replace(/^:::diet [^\n]*\n:::[ \t]*(?:\n|$)/gm, '').replace(/^(?:[ \t]*\r?\n)+|(?:\r?\n[ \t]*)+$/g, '');
}
