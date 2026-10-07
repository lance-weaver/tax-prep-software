import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const jar = await cookies();
  jar.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}
