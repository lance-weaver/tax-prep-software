import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { lastRunDir } from "@/lib/data-path";

export const runtime = "nodejs";

const ALLOWED = new Set([
  "federal_out.txt",
  "sched_c_out.txt",
  "sched_se_out.txt",
  "form_8995_out.txt",
  "utah_tc40.txt",
  "summary.json",
  "us_1040.pdf",
  "schedule_c.pdf",
  "schedule_se.pdf",
  "form_8995.pdf",
]);

export async function GET(request: Request) {
  const name = path.basename(new URL(request.url).searchParams.get("file") ?? "");
  if (!ALLOWED.has(name)) {
    return NextResponse.json({ error: "That file is not available." }, { status: 400 });
  }
  const full = path.join(lastRunDir(), name);
  if (!fs.existsSync(full)) {
    return NextResponse.json(
      { error: "Calculate the return first. That file is not in the last run." },
      { status: 404 },
    );
  }
  const bytes = fs.readFileSync(full);
  const pdf = name.endsWith(".pdf");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": pdf ? "application/pdf" : "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
