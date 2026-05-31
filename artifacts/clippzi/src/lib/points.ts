// Clippzi uses a "points" economy where 1 point = 1 cent (1 penny).
// Money values are stored as dollars (e.g. "5.00") but shown to users as
// whole points (e.g. 500 pts) — never as pennies or dollars.

export function dollarsToPoints(dollars: number | string | null | undefined): number {
  const n = Number(dollars ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function formatPoints(dollars: number | string | null | undefined): string {
  return dollarsToPoints(dollars).toLocaleString("en-US");
}
