type Cell = string | number | null | undefined;

function cell(v: Cell): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // CSV formula injection guard
  return `"${s.replace(/"/g, '""')}"`;
}

export const toCsv = (rows: Cell[][]) => rows.map((r) => r.map(cell).join(',') + '\r\n').join('');
