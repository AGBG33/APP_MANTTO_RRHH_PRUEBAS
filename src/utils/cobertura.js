// src/utils/cobertura.js
export function extractCoberturaFromShortText(shortTextRaw) {
  const s = String(shortTextRaw || "").toUpperCase();

  const idx = s.indexOf("COBERTURA");
  if (idx === -1) return null;

  // lo que viene después de "COBERTURA"
  const tail = s.slice(idx + "COBERTURA".length);

  // toma letras hasta que deje de ser letra
  const match = tail.match(/^([A-Z]+)/);
  const cov = match?.[1] || null;
  if (!cov) return null;

  // Normaliza a tus 3 posibles
  // (por si llega "BASICA", "BASICO", etc.)
  if (cov.startsWith("BASIC")) return "BASICO";
  if (cov.startsWith("MED")) return "MEDIO";
  if (cov.startsWith("SEMI")) return "SEMIFULL";

  return cov; // fallback
}
