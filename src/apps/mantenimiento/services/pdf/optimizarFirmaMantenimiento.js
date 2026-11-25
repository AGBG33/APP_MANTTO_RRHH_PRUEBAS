// Adaptado de Front/Ale-dev: src/services/pdf/optimizarFirmaMantenimiento.js
// Reduce una firma PNG grande antes de incluirla en PDFs de Mantenimiento.
// Si no mejora o falla, conserva el contenido original.
import * as ImageManipulator from "expo-image-manipulator";

export async function optimizarFirmaMantenimiento(firma) {
  const origen = String(firma || "").trim();
  if (!origen) return origen;

  const match = origen.match(/^data:image\/(png|jpeg|jpg);base64,(.*)$/is);
  const esDataUrl = !!match;
  const tipo = match?.[1]?.toLowerCase() || "png";
  const base64Original = match ? match[2] : origen;

  if (base64Original.length < 35000 || tipo !== "png") return origen;
  if (!/^[A-Za-z0-9+/=]+$/.test(base64Original)) return origen;

  try {
    const resultado = await ImageManipulator.manipulateAsync(
      `data:image/png;base64,${base64Original}`,
      [{ resize: { width: 560 } }],
      {
        format: ImageManipulator.SaveFormat.PNG,
        compress: 1,
        base64: true,
      },
    );

    const base64Optimizado = String(resultado?.base64 || "");
    if (base64Optimizado && base64Optimizado.length < base64Original.length) {
      console.log("[PDF MANTTO][FIRMA] PNG optimizado", {
        antesKB: Math.round(base64Original.length * 0.75 / 1024),
        despuesKB: Math.round(base64Optimizado.length * 0.75 / 1024),
      });
      return esDataUrl
        ? `data:image/png;base64,${base64Optimizado}`
        : base64Optimizado;
    }
  } catch (error) {
    console.warn("[PDF MANTTO][FIRMA] Se conserva la original:", error?.message || error);
  }
  return origen;
}
