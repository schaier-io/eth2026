import { NextResponse } from "next/server";
import { loadClaimDocument, storeClaimDocument } from "../../../../lib/server/swarm-claim";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("reference")?.trim();
  if (!reference) {
    return NextResponse.json({ error: "Missing Swarm reference." }, { status: 400 });
  }

  const loaded = await loadClaimDocument(reference);
  return NextResponse.json(loaded);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      title?: unknown;
      context?: unknown;
      tags?: unknown;
    };

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const context = typeof body.context === "string" ? body.context.trim() : "";
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)
      : [];

    if (!title) {
      return NextResponse.json({ error: "Add a claim title." }, { status: 400 });
    }
    if (!context) {
      return NextResponse.json({ error: "Add detailed YES/NO resolution rules." }, { status: 400 });
    }

    const stored = await storeClaimDocument({ title, context, tags });
    return NextResponse.json(stored);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
