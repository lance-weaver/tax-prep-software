import { NextResponse } from "next/server";
import { parseBrokerCsv } from "@/lib/ots/broker-csv";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > 1_000_000) {
    return NextResponse.json({ error: "That CSV is larger than 1 MB." }, { status: 413 });
  }
  try {
    return NextResponse.json(parseBrokerCsv(text));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The CSV could not be read.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
