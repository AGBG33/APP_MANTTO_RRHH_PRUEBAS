// src/services/templates/mantto_freno_pm_pmf/manttoFrenoPmPmf.utils.js

export const safeStr = (v) => String(v ?? "").trim();

export function escapeHtml(value) {
  return safeStr(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function check(value) {
  return value ? "☑" : "☐";
}

export function fmtValue(value, fallback = "—") {
  const s = safeStr(value);
  return s || fallback;
}

export function fmtDateLocal(value) {
  if (!value) return "—";
  if (typeof value === "string" && value.includes("/")) return value;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return safeStr(value) || "—";

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  return `${dd}/${mm}/${yyyy}`;
}

export function fmtBienMal(value) {
  if (value === "bien") return "Bien";
  if (value === "mal") return "Mal";
  return "—";
}