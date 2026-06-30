// seed_users.mjs — admin-create all SERC team accounts (full union).
// Run:  node seed_users.mjs
// Requires: npm i @supabase/supabase-js
//
// Set these in your shell first (do NOT hardcode the service-role key):
//   PowerShell:
//   $env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ...your service role key..."

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "sercdevelopers";

const emails = [
  "122bsh@gmail.com",
  "24mheller@gmail.com",
  "arhanghosh30@gmail.com",
  "bww25@vt.edu",
  "dmisi98@gmail.com",
  "gunjansiddharth03@gmail.com",
  "hassan65@purdue.edu",
  "jsantosuosso@vt.edu",
  "k.orosheva1@gmail.com",
  "kihm2278@gmail.com",
  "krishna32123@vt.edu",
  "liuhongf@grinnell.edu",
  "moksh191@tamu.edu",
  "njijun24@vt.edu",
  "okinealb@grinnell.edu",
  "supashbhat@gmail.com",
  "youssefchebil@vt.edu",
];

const run = async () => {
  let created = 0, skipped = 0;
  for (const email of emails) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true, // mark confirmed so they can log in immediately
    });
    if (error) {
      console.log(`SKIP/FAIL  ${email}  →  ${error.message}`);
      skipped++;
    } else {
      console.log(`CREATED    ${email}  →  ${data.user.id}`);
      created++;
    }
  }
  console.log(`\nDone. Created ${created}, skipped/failed ${skipped}.`);
};

run();
