import fs from "node:fs";
import { NextResponse } from "next/server";
import { profileFilePath } from "@/lib/data-path";
import { normalizeProfile } from "@/lib/normalize-return";

export const runtime = "nodejs";

export async function GET() {
  const file = profileFilePath();
  if (!fs.existsSync(file)) {
    return NextResponse.json({ saved: false, profile: null });
  }
  try {
    const profile = normalizeProfile(JSON.parse(fs.readFileSync(file, "utf8")));
    return NextResponse.json({ saved: true, profile });
  } catch {
    return NextResponse.json({ error: "The usual-items profile could not be read." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the profile as JSON." }, { status: 400 });
  }
  const profile = normalizeProfile(body);
  fs.writeFileSync(profileFilePath(), JSON.stringify(profile, null, 2));
  return NextResponse.json({ saved: true, profile });
}
