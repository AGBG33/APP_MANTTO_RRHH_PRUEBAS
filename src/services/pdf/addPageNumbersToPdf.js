import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function addPageNumbersToPdfBase64(pdfBase64) {
  const pdfDoc = await PDFDocument.load(pdfBase64);
  const pages = pdfDoc.getPages();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 8;
  const totalPages = pages.length;

  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const text = `Documento generado desde Melmex-App · Página ${index + 1} de ${totalPages}`;
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: 18,
      size: fontSize,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  });

  return await pdfDoc.saveAsBase64();
}