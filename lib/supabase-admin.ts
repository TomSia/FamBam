import { createClient } from "@supabase/supabase-js";

// Server-only client using the service role key. Never import this file
// from client components — the service role key bypasses Row Level
// Security, so it must stay out of the browser bundle.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export const NOTE_IMAGES_BUCKET = "note-images";
