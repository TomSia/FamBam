import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("GET /api/notes error:", error);

    return NextResponse.json(
      { error: "Couldn't load notes." },
      { status: 500 }
    );
  }

  const notes = data.map((note) => ({
    id: note.id,
    name: note.name,
    text: note.text,
    image: note.image,
    createdAt: new Date(note.created_at).getTime(),
  }));

  return NextResponse.json({ notes });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const name = String(body.name ?? "").trim();
    const text = String(body.text ?? "").trim();
    const image = body.image ?? null;

    if (!name || !text) {
      return NextResponse.json(
        { error: "Name and note are required." },
        { status: 400 }
      );
    }

    if (name.length > 40) {
      return NextResponse.json(
        { error: "Name is too long." },
        { status: 400 }
      );
    }

    if (text.length > 500) {
      return NextResponse.json(
        { error: "Note is too long." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("notes")
      .insert({
        name,
        text,
        image,
      })
      .select()
      .single();

    if (error) {
      console.error("POST /api/notes error:", error);

      return NextResponse.json(
        { error: "Couldn't save that note." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      note: {
        id: data.id,
        name: data.name,
        text: data.text,
        image: data.image,
        createdAt: new Date(data.created_at).getTime(),
      },
    });
  } catch (error) {
    console.error("POST /api/notes unexpected error:", error);

    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 }
    );
  }
}