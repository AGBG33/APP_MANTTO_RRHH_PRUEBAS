// src/templates/renderOperacionesHtml.js

const safeStr = (v) => String(v ?? "").trim();

function escapeHtml(str) {
  return safeStr(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const getUsr02 = (op) => safeStr(op?.Usr02 ?? op?.usr02) || "SIN UBICACIÓN";
const getActivity = (op) => safeStr(op?.activity ?? op?.Activity);
const getSub = (op) => safeStr(op?.subactivity ?? op?.SubActivity);
const getDesc = (op) => safeStr(op?.description ?? op?.Description);
const getSTK = (op) => safeStr(op?.StandardTextKey ?? op?.standardTextKey);

function getOpId(orderid, op, idx) {
  const existing = safeStr(op?.id);
  if (existing) return existing;

  const a = getActivity(op);
  const s = getSub(op);
  const oid = safeStr(orderid);

  const key = `${oid}-${a}${s ? `-${s}` : ""}`.trim();
  return key && key !== "-" ? key : `fallback__${idx}`;
}

function isOpChecked(orderid, op, idx, checkedMap = {}) {
  const id = getOpId(orderid, op, idx);
  const oid = safeStr(orderid);
  const act = getActivity(op);
  const sub = getSub(op);

  const actPad = act ? act.padStart(4, "0") : "";
  const subPad = sub ? sub.padStart(4, "0") : "";

  const keys = [
    id,
    safeStr(op?.id),
    act,
    actPad,
    oid && act ? `${oid}-${act}` : "",
    oid && actPad ? `${oid}-${actPad}` : "",
    oid && act && sub ? `${oid}-${act}-${sub}` : "",
    oid && actPad && sub ? `${oid}-${actPad}-${sub}` : "",
    oid && act && subPad ? `${oid}-${act}-${subPad}` : "",
    oid && actPad && subPad ? `${oid}-${actPad}-${subPad}` : "",
  ].filter(Boolean);

  return keys.some((k) => !!checkedMap[k]);
}

function numericOrBig(v) {
  const s = safeStr(v);
  if (!s) return Number.MAX_SAFE_INTEGER;

  const n = parseInt(s, 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

function textCode(v) {
  return safeStr(v).toLowerCase();
}

function sortOps(ops = []) {
  return [...ops].sort((a, b) => {
    const aActNum = numericOrBig(getActivity(a));
    const bActNum = numericOrBig(getActivity(b));
    if (aActNum !== bActNum) return aActNum - bActNum;

    const aActTxt = textCode(getActivity(a));
    const bActTxt = textCode(getActivity(b));
    if (aActTxt !== bActTxt) return aActTxt.localeCompare(bActTxt);

    const aSubNum = numericOrBig(getSub(a));
    const bSubNum = numericOrBig(getSub(b));
    if (aSubNum !== bSubNum) return aSubNum - bSubNum;

    const aSubTxt = textCode(getSub(a));
    const bSubTxt = textCode(getSub(b));
    if (aSubTxt !== bSubTxt) return aSubTxt.localeCompare(bSubTxt);

    const aDesc = getDesc(a).toLowerCase();
    const bDesc = getDesc(b).toLowerCase();
    return aDesc.localeCompare(bDesc);
  });
}

function buildOperacionLine(op) {
  const act = getActivity(op) || "—";
  const sub = getSub(op);
  const desc = getDesc(op);

  return {
    code: `${escapeHtml(act)}${sub ? `-${escapeHtml(sub)}` : ""}`,
    desc: escapeHtml(desc),
  };
}

export function renderOperacionesAgrupadasHtml({
  orderid,
  operaciones = [],
  checkedMap = {},
}) {
  const groups = {};

  for (const op of operaciones || []) {
    const ubic = getUsr02(op);
    if (!groups[ubic]) groups[ubic] = [];
    groups[ubic].push(op);
  }

  const ubicaciones = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  if (!ubicaciones.length) {
    return `<div class="opsEmpty">No hay operaciones.</div>`;
  }

  const html = ubicaciones
    .map((ubic) => {
      const ops = sortOps(groups[ubic] || []);

      const renderedItems = ops.map((op, idx) => {
          const checked = isOpChecked(orderid, op, idx, checkedMap);

          const { code, desc } = buildOperacionLine(op);
          const stk = getSTK(op);

          const descNorm = safeStr(getDesc(op)).toLowerCase();
          const stkNorm = safeStr(stk).toLowerCase();
          const showStk = !!stk;
          const showStkBold = showStk && stkNorm && !descNorm.includes(stkNorm);

          return `
            <div class="opItem ${checked ? "checked" : ""}">
              <div class="cbWrap">
                <span class="cb">${checked ? "☑" : "☐"}</span>
              </div>

              <div class="opBody">
                <div class="opCode">${code}</div>
                ${
                  desc
                    ? `<div class="opDesc">${desc}</div>`
                    : `<div class="opDesc opDescEmpty">Sin descripción</div>`
                }
                ${
                  showStk
                    ? showStkBold
                      ? `<div class="opStk"><b>${escapeHtml(stk)}</b></div>`
                      : `<div class="opStk">${escapeHtml(stk)}</div>`
                    : ""
                }
              </div>
            </div>
          `;
        });

      const renderedRows = [];

      for (let idx = 0; idx < renderedItems.length; idx += 2) {
        const leftItem = renderedItems[idx] || "";
        const rightItem = renderedItems[idx + 1] || "";

        renderedRows.push(`
          <tr class="opRow">
            <td class="opCell">
              ${leftItem}
            </td>
            <td class="opCell ${rightItem ? "" : "opCellEmpty"}">
              ${rightItem}
            </td>
          </tr>
        `);
      }

      return `
        <div class="ubicCard">
          <div class="ubicTitle">${escapeHtml(ubic)}</div>
          <table class="ubicGrid">
            <tbody>
              ${renderedRows.join("")}
            </tbody>
          </table>
        </div>
      `;
    })
    .join("");

  return `<div class="opsWrap">${html}</div>`;
}

export default renderOperacionesAgrupadasHtml;