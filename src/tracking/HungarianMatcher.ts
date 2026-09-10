/**
 * HungarianMatcher.ts — Munkres algorithm for bipartite assignment
 * Minimizes total cost over rows×cols assignment.
 * Returns list of [row, col] assignments.
 */

export function hungarianMatch(costMatrix: number[][]): [number, number][] {
  const rows = costMatrix.length;
  if (rows === 0) return [];
  const cols = costMatrix[0].length;
  if (cols === 0) return [];

  const n = Math.max(rows, cols);
  // Pad to square
  const cost: number[][] = Array.from({length: n}, (_, r) =>
    Array.from({length: n}, (_, c) =>
      r < rows && c < cols ? costMatrix[r][c] : 0,
    ),
  );

  const u = new Array(n + 1).fill(0); // row potentials
  const v = new Array(n + 1).fill(0); // col potentials
  const p = new Array(n + 1).fill(0); // col → row assignment
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minDist = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);

    do {
      used[j0] = true;
      let delta = Infinity;
      let j1 = -1;
      const i0 = p[j0];
      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const val = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (val < minDist[j]) {
            minDist[j] = val;
            way[j] = j0;
          }
          if (minDist[j] < delta) {
            delta = minDist[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minDist[j] -= delta;
        }
      }
      j0 = j1!;
    } while (p[j0] !== 0);

    do {
      p[j0] = p[way[j0]];
      j0 = way[j0];
    } while (j0 !== 0);
  }

  const assignments: [number, number][] = [];
  for (let j = 1; j <= n; j++) {
    if (p[j] !== 0 && p[j] <= rows && j <= cols) {
      assignments.push([p[j] - 1, j - 1]);
    }
  }
  return assignments;
}
