/**
 * Text-layer extraction with pdf.js, on the server only.
 * A scan with no text comes back as needsOcr so the browser can run
 * tesseract.js against the file the person still has. Documents are
 * never sent to a third party.
 */
export async function extractPdfText(data: Uint8Array): Promise<{ text: string; needsOcr: boolean }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs 4 still honors disableWorker at runtime. The published type is a
  // union that rejects the extra field, so the options are passed as the
  // parameter type the function already accepts.
  const options = {
    data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  } as Parameters<typeof pdfjs.getDocument>[0];
  const document = await pdfjs.getDocument(options).promise;
  const pages: string[] = [];
  const limit = Math.min(document.numPages, 6);
  for (let number = 1; number <= limit; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(line);
  }
  const text = pages.join("\n").replace(/[ \t]+\n/g, "\n").trim();
  return { text, needsOcr: text.replace(/\s/g, "").length < 24 };
}
