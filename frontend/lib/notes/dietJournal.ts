/** Compare journal edits independently of the DIET dashboard's derived snapshot. */
export function withoutDietDashboard(content: string): string {
  return content.replace(/^:::diet [^\n]*\n:::[ \t]*(?:\n|$)/gm, (block, at: number) => {
    let character = '', length = 0;
    for (const line of content.slice(0, at).split('\n')) {
      const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (!fence) continue;
      if (!length) { character = fence[1][0]; length = fence[1].length; }
      else if (fence[1][0] === character && fence[1].length >= length && !fence[2].trim()) length = 0;
    }
    return length ? block : '';
  }).replace(/^(?:[ \t]*\r?\n)+|(?:\r?\n[ \t]*)+$/g, '');
}
