import fs from "node:fs";
import { NextResponse } from "next/server";
import { returnFilePath } from "@/lib/data-path";
import { normalizeReturn } from "@/lib/normalize-return";
import { sampleReturn } from "@/lib/sample-return";

export const runtime = "nodejs";

export async function GET() {
  const file = returnFilePath();
  if (!fs.existsSync(file)) {
    return NextResponse.json({ saved: false, taxReturn: sampleReturn });
  }
  try {
    const taxReturn = normalizeReturn(JSON.parse(fs.readFileSync(file, "utf8")));
    return NextResponse.json({ saved: true, taxReturn });
  } catch {
    return NextResponse.json(
      { error: "The saved return could not be read." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the return as JSON." }, { status: 400 });
  }
  const taxReturn = normalizeReturn(body);
  fs.writeFileSync(returnFilePath(), JSON.stringify(taxReturn, null, 2));
  return NextResponse.json({ saved: true, taxReturn });
}
