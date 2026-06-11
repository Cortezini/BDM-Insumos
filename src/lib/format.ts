const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const currency = (n: number) => brlFormatter.format(n || 0);

export function formatCurrencyInputFromDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return brlFormatter.format(Number(digits) / 100);
}

export function formatCurrencyInputValue(value: unknown) {
  if (value === "" || value === null || value === undefined) return "";
  if (typeof value === "number") return brlFormatter.format(value);

  const text = String(value).trim();
  if (!text) return "";

  const plainNumber = Number(text);
  if (/^-?\d+(\.\d+)?$/.test(text) && Number.isFinite(plainNumber)) {
    return brlFormatter.format(plainNumber);
  }

  return formatCurrencyInputFromDigits(text);
}

export function parseCurrencyInput(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = String(value ?? "").trim();
  if (!text) return 0;

  const plainNumber = Number(text);
  if (/^-?\d+(\.\d+)?$/.test(text) && Number.isFinite(plainNumber)) {
    return plainNumber;
  }

  const digits = text.replace(/\D/g, "");
  return digits ? Number(digits) / 100 : 0;
}

export const number = (n: number) => new Intl.NumberFormat("pt-BR").format(n || 0);
export const dateBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
export const dateTimeBR = (iso: string) => new Date(iso).toLocaleString("pt-BR");

export function exportToCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(";")),
  ].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPDF(title: string, headers: string[], rows: (string | number)[][]) {
  const html = `<html><head><title>${title}</title><style>
    body{font-family:system-ui;padding:24px;color:#0f172a}
    h1{margin:0 0 16px;font-size:18px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left}
    th{background:#f1f5f9}
  </style></head><body>
    <h1>${title}</h1>
    <table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}
