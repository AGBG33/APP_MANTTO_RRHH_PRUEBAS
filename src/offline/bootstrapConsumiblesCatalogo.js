import { isOnline } from "./net";
import api from "../services/api";
import { mergeConsumiblesPair } from "./consumiblesCatalogoCache";

export const COVERAGE_PAIRS = {
  BASICA: [
    { Agr1: "BASICO", Agr2: "GRASAS" },
    { Agr1: "BASICO", Agr2: "DIELECTRIC" },
    { Agr1: "BASICO", Agr2: "ACEITE" },
    { Agr1: "BASICO", Agr2: "TRAPO" },
    { Agr1: "BASICO", Agr2: "PAPEL_LIJA" },
    { Agr1: "BASICO", Agr2: "TORNILLOS" },
    { Agr1: "BASICO", Agr2: "PERNOS" },
    { Agr1: "BASICO", Agr2: "ARAN_CUER" },
  ],
  MEDIA: [
    { Agr1: "BASICO", Agr2: "GRASAS" },
    { Agr1: "BASICO", Agr2: "DIELECTRIC" },
    { Agr1: "BASICO", Agr2: "ACEITE" },
    { Agr1: "BASICO", Agr2: "TRAPO" },
    { Agr1: "BASICO", Agr2: "PAPEL_LIJA" },
    { Agr1: "BASICO", Agr2: "TORNILLOS" },
    { Agr1: "BASICO", Agr2: "PERNOS" },
    { Agr1: "BASICO", Agr2: "ARAN_CUER" },

    { Agr1: "MEDIO", Agr2: "FUSIBLE_TC" },
    { Agr1: "MEDIO", Agr2: "MECHAS" },
    { Agr1: "MEDIO", Agr2: "DESLIZADOR" },
    { Agr1: "MEDIO", Agr2: "FOCOS" },
    { Agr1: "MEDIO", Agr2: "LAMPARA" },
    { Agr1: "MEDIO", Agr2: "LAMP_EMERG" },
    { Agr1: "MEDIO", Agr2: "PLAST_CABI" },
    { Agr1: "MEDIO", Agr2: "PLAST_CONT" },
    { Agr1: "MEDIO", Agr2: "BATERIA_RE" },
    { Agr1: "MEDIO", Agr2: "CAM_ACEITE" },
    { Agr1: "MEDIO", Agr2: "MICROSWICH" },
    { Agr1: "MEDIO", Agr2: "CABLE_ELEC" },
  ],
  SEMI: [
    { Agr1: "BASICO", Agr2: "GRASAS" },
    { Agr1: "BASICO", Agr2: "DIELECTRIC" },
    { Agr1: "BASICO", Agr2: "ACEITE" },
    { Agr1: "BASICO", Agr2: "TRAPO" },
    { Agr1: "BASICO", Agr2: "PAPEL_LIJA" },
    { Agr1: "BASICO", Agr2: "TORNILLOS" },
    { Agr1: "BASICO", Agr2: "PERNOS" },
    { Agr1: "BASICO", Agr2: "ARAN_CUER" },

    { Agr1: "MEDIO", Agr2: "FUSIBLE_TC" },
    { Agr1: "MEDIO", Agr2: "MECHAS" },
    { Agr1: "MEDIO", Agr2: "DESLIZADOR" },
    { Agr1: "MEDIO", Agr2: "FOCOS" },
    { Agr1: "MEDIO", Agr2: "LAMPARA" },
    { Agr1: "MEDIO", Agr2: "LAMP_EMERG" },
    { Agr1: "MEDIO", Agr2: "PLAST_CABI" },
    { Agr1: "MEDIO", Agr2: "PLAST_CONT" },
    { Agr1: "MEDIO", Agr2: "BATERIA_RE" },
    { Agr1: "MEDIO", Agr2: "CAM_ACEITE" },
    { Agr1: "MEDIO", Agr2: "MICROSWICH" },
    { Agr1: "MEDIO", Agr2: "CABLE_ELEC" },

    { Agr1: "SEMIFULL", Agr2: "EXEN_COLGA" },
    { Agr1: "SEMIFULL", Agr2: "VENTI_CABIN" },
    { Agr1: "SEMIFULL", Agr2: "ACEITERAS" },
    { Agr1: "SEMIFULL", Agr2: "BALASTRAS" },
    { Agr1: "SEMIFULL", Agr2: "MICRO_SEGU" },
    { Agr1: "SEMIFULL", Agr2: "INTERLOCK" },
    { Agr1: "SEMIFULL", Agr2: "BAND_MOTOR" },
    { Agr1: "SEMIFULL", Agr2: "GOMA_CABI" },
    { Agr1: "SEMIFULL", Agr2: "GOMA_TOPE" },
    { Agr1: "SEMIFULL", Agr2: "CABLE_ACER" },
    { Agr1: "SEMIFULL", Agr2: "RETEN_ACEI" },
    { Agr1: "SEMIFULL", Agr2: "TRANF_ENER" },
  ],
};

function uniqPairsForCoverage(coverageKey) {
  const arr = COVERAGE_PAIRS[String(coverageKey || "").toUpperCase()] || [];
  const seen = new Set();

  return arr.filter((p) => {
    const k = `${String(p?.Agr1 || "").trim().toUpperCase()}__${String(
      p?.Agr2 || ""
    )
      .trim()
      .toUpperCase()}`;

    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function extractResults(res) {
  return res?.data?.d?.results || res?.data?.results || [];
}

async function fetchMaterialesByPair(agr1, agr2) {
  const a1 = String(agr1 || "").trim().toUpperCase();
  const a2 = String(agr2 || "").trim().toUpperCase();

  const url =
    `/api/odata/ZSD_CATALOGOS_SRV/MaterialesCoberturaSet` +
    `?$filter=Agrupador1 eq '${a1}' and Agrupador2 eq '${a2}'`;

  const res = await api.get(url);
  return extractResults(res);
}

export async function bootstrapPrefetchConsumiblesCatalogo({
  coverages = ["BASICA", "MEDIA", "SEMI"],
} = {}) {
  const online = await isOnline();
  if (!online) return { ok: false, reason: "offline" };

  let ok = 0;
  let fail = 0;
  const detail = [];

  for (const coverage of coverages) {
    const cov = String(coverage || "").trim().toUpperCase();
    const pairs = uniqPairsForCoverage(cov);

    for (const pair of pairs) {
      const a1 = String(pair?.Agr1 || "").trim().toUpperCase();
      const a2 = String(pair?.Agr2 || "").trim().toUpperCase();

      try {
        const rows = await fetchMaterialesByPair(a1, a2);

        await mergeConsumiblesPair({
          coverageKey: cov,
          agr1: a1,
          agr2: a2,
          materials: rows,
        });

        ok += 1;
        detail.push({
          coverage: cov,
          Agr1: a1,
          Agr2: a2,
          count: Array.isArray(rows) ? rows.length : 0,
          ok: true,
        });
      } catch (e) {
        fail += 1;
        detail.push({
          coverage: cov,
          Agr1: a1,
          Agr2: a2,
          count: 0,
          ok: false,
          error: e?.message || String(e),
        });
      }
    }
  }

  return {
    ok: true,
    fetched: ok,
    failed: fail,
    detail,
  };
}