/** Minimal line diff (LCS) producing unified-style lines prefixed with ' ', '+', '-'. */
export function lineDiff(a: string, b: string): string {
  const x = a.split('\n');
  const y = b.split('\n');
  const n = x.length;
  const m = y.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push(' ' + x[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push('-' + x[i++]);
    } else {
      out.push('+' + y[j++]);
    }
  }
  while (i < n) out.push('-' + x[i++]);
  while (j < m) out.push('+' + y[j++]);
  return out.join('\n');
}
