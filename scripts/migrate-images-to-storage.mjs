// One-time script: moves every base64 image currently sitting in the
// `notes.image` column into a Supabase Storage bucket, and rewrites that
// column to hold the resulting public URL instead.
//
// Run locally (not on Vercel) with:
//   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
//   node scripts/migrate-images-to-storage.mjs
//
// Get the service role key from: Supabase dashboard -> Project Settings
// -> API -> service_role (NOT the anon key). Keep it secret, don't commit it.

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = "note-images";

async function main() {
  // Make sure the bucket exists before we start (create it if missing).
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET);
  if (!exists) {
    console.log(`Bucket "${BUCKET}" not found — creating it as public...`);
    const { error: createError } = await supabase.storage.createBucket(BUCKET, {
      public: true,
    });
    if (createError) {
      console.error("Couldn't create bucket:", createError.message);
      process.exit(1);
    }
  }

  const { data: rows, error } = await supabase
    .from("notes")
    .select("id, image")
    .like("image", "data:image%");

  if (error) {
    console.error("Failed to fetch rows:", error.message);
    process.exit(1);
  }

  console.log(`Found ${rows.length} row(s) with an embedded base64 image.\n`);

  let migrated = 0;
  let failed = 0;

  for (const row of rows) {
    const match = row.image.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
    if (!match) {
      console.warn(`Row ${row.id}: couldn't parse image data, skipping.`);
      failed++;
      continue;
    }

    const [, mime, base64] = match;
    const buffer = Buffer.from(base64, "base64");
    const ext = mime.split("/")[1]?.split("+")[0] || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mime, upsert: false });

    if (uploadError) {
      console.error(`Row ${row.id}: upload failed - ${uploadError.message}`);
      failed++;
      continue;
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

    const { error: updateError } = await supabase
      .from("notes")
      .update({ image: pub.publicUrl })
      .eq("id", row.id);

    if (updateError) {
      console.error(`Row ${row.id}: DB update failed - ${updateError.message}`);
      failed++;
      continue;
    }

    console.log(`Row ${row.id}: migrated -> ${pub.publicUrl}`);
    migrated++;
  }

  console.log(`\nDone. Migrated ${migrated}, failed ${failed}.`);
}

main();
