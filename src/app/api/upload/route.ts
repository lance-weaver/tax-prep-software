import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { uploadsDir } from "@/lib/data-path";
import { extractPdfText } from "@/lib/pdf/extract-text";
import { parseTaxDocument } from "@/lib/pdf/parse-forms";

export const runtime = "nodejs";

const MAX_BYTES = 8_000_000;

export async function POST(request: Request) {
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "That file is larger than 8 MB." }, { status: 413 });
  }
  if (bytes.byteLength < 5) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  const id = crypto.randomBytes(8).toString("hex");
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  let text = "";
  let needsOcr = true;
  if (isPdf) {
    try {
      const extracted = await extractPdfText(bytes);
      text = extracted.text;
      needsOcr = extracted.needsOcr;
    } catch {
      needsOcr = true;
    }
  }
  const parsed = parseTaxDocument(text);
  const dir = uploadsDir();
  fs.writeFileSync(path.join(dir, `${id}.bin`), bytes);
  fs.writeFileSync(
    path.join(dir, `${id}.json`),
    JSON.stringify({ form: parsed.form, needsOcr, fields: parsed.fields }),
  );
  return NextResponse.json({
    id,
    form: parsed.form,
    needsOcr,
    fields: parsed.fields,
    text: text.slice(0, 4000),
  });
}

export async function DELETE(request: Request) {
  const id = path.basename(new URL(request.url).searchParams.get("id") ?? "");
  if (!/^[a-f0-9]{16}$/.test(id)) {
    return NextResponse.json({ error: "Unknown upload." }, { status: 400 });
  }
  const dir = uploadsDir();
  for (const name of [`${id}.bin`, `${id}.json`]) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) fs.rmSync(full);
  }
  return NextResponse.json({ deleted: true });
}
