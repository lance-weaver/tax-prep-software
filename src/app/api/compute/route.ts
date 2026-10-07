import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { lastRunDir, returnFilePath } from "@/lib/data-path";
import { normalizeReturn } from "@/lib/normalize-return";
import { computeReturn } from "@/lib/ots/run-return";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the return as JSON." }, { status: 400 });
  }
  const taxReturn = normalizeReturn(body);
  fs.writeFileSync(returnFilePath(), JSON.stringify(taxReturn, null, 2));

  const dir = lastRunDir();
  for (const name of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }

  try {
    const { summary } = await computeReturn(taxReturn, dir);
    return NextResponse.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The return did not calculate.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
