import { createClient } from "npm:@supabase/supabase-js@2";

function requiredEnv(name: string): string {
  const val = Deno.env.get(name);
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

// Validate required env vars at cold start.
requiredEnv("SUPABASE_URL");
requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function isValidEmail(email: string): boolean {
  // Intentionally simple validation.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const ALLOWED_ROLES = new Set(["sales", "user", "admin"]);

async function assertRequestingUserIsAdmin(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { ok: false as const, status: 401, error: "Missing Authorization Bearer token" };

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return { ok: false as const, status: 401, error: "Invalid or expired token" };
  }

  const userId = userData.user.id;
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return { ok: false as const, status: 500, error: profileError.message };
  }

  if (!profile || profile.role !== "admin") {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const adminCheck = await assertRequestingUserIsAdmin(req);
    if (!adminCheck.ok) {
      return jsonResponse({ error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await req.json().catch(() => ({}));
    const emailRaw = (body?.email ?? "").toString();
    const roleRaw = (body?.role ?? "").toString();

    const email = emailRaw.trim().toLowerCase();
    const role = roleRaw.trim();

    if (!email || !isValidEmail(email)) {
      return jsonResponse({ error: "Invalid email" }, { status: 400 });
    }

    if (!role || !ALLOWED_ROLES.has(role)) {
      return jsonResponse({ error: "Invalid role" }, { status: 400 });
    }

    // Reject duplicates (profiles.email is UNIQUE, but this gives a nicer error).
    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfileError) {
      return jsonResponse({ error: existingProfileError.message }, { status: 500 });
    }

    if (existingProfile) {
      return jsonResponse({ error: "User with this email already exists" }, { status: 409 });
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (createError || !created?.user) {
      const message = createError?.message ?? "Failed to create user";
      const status = /already\s*(registered|exists)|email\s*already\s*in\s*use/i.test(message) ? 409 : 500;
      return jsonResponse({ error: message }, { status });
    }

    const userId = created.user.id;

    // Ensure profile exists immediately to avoid frontend race conditions.
    // If a signup trigger also inserts the row, onConflict keeps this idempotent.
    const { data: profileRow, error: upsertProfileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: userId,
          email,
          role,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      .select("id, email, role")
      .maybeSingle();

    if (upsertProfileError) {
      // Best-effort cleanup: delete created auth user if profile upsert fails.
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      return jsonResponse({ error: upsertProfileError.message }, { status: 500 });
    }

    return jsonResponse({
      message: "User invited successfully",
      user_id: userId,
      profile: profileRow ?? null,
    });
  } catch (err: any) {
    return jsonResponse({ error: err?.message ?? String(err) }, { status: 500 });
  }
});
