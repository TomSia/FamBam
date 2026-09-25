import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Missing note ID." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("DELETE /api/notes error:", error);

    return NextResponse.json(
      { error: "Couldn't delete that note." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}