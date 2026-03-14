import { createClient } from "npm:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// MIGRATED: inviteUser
// Previously wrote to the retired `profiles` table.
// Now provisions auth.users and inserts into the operational `employees` table.
// Authorization check reads from `employees` + `roles` (no longer `profiles`).
// ---------------------------------------------------------------------------

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

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const ALLOWED_ROLES = new Set(["sales", "user", "admin"]);

/**
 * Authorize the caller by checking the employees table joint with roles.
 * Accepts service-role bypass for internal calls.
 */
async function isAuthorizedRequest(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = getBearerToken(authHeader);
  if (!token) return false;

  // Service-role bypass for server-to-server calls.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && token === serviceRoleKey) return true;

  // Validate JWT and look up caller in employees + roles.
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return false;

  const userId = userData.user.id;
  const { data: employee, error: empError } = await supabaseAdmin
    .from("employees")
    .select("id, roles(code)")
    .eq("id", userId)
    .maybeSingle();

  if (empError || !employee) return false;

  const roleCode = (employee as any)?.roles?.code as string | null;
  return roleCode === "admin";
}

/**
 * Resolve the UUID of the role given a role code string (e.g., "user", "admin").
 * Returns null if the role does not exist in the roles table.
 */
async function resolveRoleId(roleCode: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("roles")
    .select("id")
    .eq("code", roleCode)
    .maybeSingle();

  if (error || !data) return null;
  return (data as any).id as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const isAuthorized = await isAuthorizedRequest(req);
    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        },
      );
    }

    const body = await req.json().catch(() => ({}));
    const emailRaw = (body?.email ?? "").toString();
    const roleRaw = (body?.role ?? "user").toString();

    const email = emailRaw.trim().toLowerCase();
    const roleCode = roleRaw.trim();

    if (!email || !isValidEmail(email)) {
      return jsonResponse({ error: "Invalid email" }, { status: 400 });
    }

    if (!roleCode || !ALLOWED_ROLES.has(roleCode)) {
      return jsonResponse({ error: "Invalid role" }, { status: 400 });
    }

    // Resolve role UUID from the roles table.
    const roleId = await resolveRoleId(roleCode);
    if (!roleId) {
      return jsonResponse(
        { error: `Role '${roleCode}' not found in the roles table. Ensure it is seeded.` },
        { status: 422 },
      );
    }

    // Check for duplicate employee record.
    const { data: existingEmployee, error: existingEmpError } = await supabaseAdmin
      .from("employees")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingEmpError) {
      return jsonResponse({ error: existingEmpError.message }, { status: 500 });
    }

    if (existingEmployee) {
      return jsonResponse({ error: "User with this email already exists" }, { status: 409 });
    }

    // Create auth user (no password — user must accept email invite or set via magic link).
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

    // Provision the employee record in the operational DB.
    // email is the minimum required field; first_name/last_name can be updated later.
    const { data: employeeRow, error: upsertEmpError } = await supabaseAdmin
      .from("employees")
      .upsert(
        {
          id: userId,
          email,
          role_id: roleId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      .select("id, email, role_id")
      .maybeSingle();

    if (upsertEmpError) {
      // Best-effort rollback: remove the auth user if employee provisioning fails.
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      return jsonResponse({ error: upsertEmpError.message }, { status: 500 });
    }

    return jsonResponse({
      message: "User invited successfully",
      user_id: userId,
      employee: employeeRow ?? null,
    });
  } catch (err: any) {
    return jsonResponse({ error: err?.message ?? String(err) }, { status: 500 });
  }
});
