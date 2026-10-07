import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { credentialsMatch, sessionCookieName, signSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { user?: string; password?: string };
  try {
    body = (await request.json()) as { user?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Send a username and password." }, { status: 400 });
  }
  const user = body.user ?? "";
  const password = body.password ?? "";
  if (!credentialsMatch(user, password)) {
    return NextResponse.json({ error: "Sign-in failed." }, { status: 401 });
  }
  const jar = await cookies();
  jar.set(sessionCookieName, signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 14 * 24 * 60 * 60,
  });
  return NextResponse.json({ ok: true });
}
