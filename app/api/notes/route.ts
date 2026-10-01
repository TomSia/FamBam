import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin, NOTE_IMAGES_BUCKET } from "@/lib/supabase-admin";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("notes")
    .select("id, name, text, image, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ notes: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = (body.name || "").toString().trim();
  const text = (body.text || "").toString().trim();
  const imageDataUrl: string | null = body.image || null;

  if (!name || !text) {
    return NextResponse.json(
      { error: "Name and note text are required." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  let imageUrl: string | null = null;

  // The browser still sends a compressed base64 data URL (same as before) —
  // the difference is the SERVER now puts the bytes in Storage and only
  // ever writes a short URL string into the notes table.
  if (imageDataUrl) {
    const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: "Invalid image data." }, { status: 400 });
    }
    const [, mime, base64] = match;
    const buffer = Buffer.from(base64, "base64");

    if (buffer.length > 2_000_000) {
      return NextResponse.json({ error: "That image is too large." }, { status: 400 });
    }

    const ext = mime.split("/")[1] || "jpg";
    const path = `${randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(NOTE_IMAGES_BUCKET)
      .upload(path, buffer, { contentType: mime, upsert: false });

    if (uploadError) {
      return NextResponse.json(
        { error: "Image upload failed: " + uploadError.message },
        { status: 500 }
      );
    }

    const { data: pub } = supabase.storage
      .from(NOTE_IMAGES_BUCKET)
      .getPublicUrl(path);
    imageUrl = pub.publicUrl;
  }

  const { data, error } = await supabase
    .from("notes")
    .insert({ name, text, image: imageUrl })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ note: data }, { status: 201 });
}