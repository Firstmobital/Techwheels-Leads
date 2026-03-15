import { createClient } from "npm:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// inviteUser
// provisions auth.users and inserts into the operational `employees` table.
// Authorization check reads from `employees` + `roles`.
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
 */
async function isAuthorizedRequest(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = getBearerToken(authHeader);
  if (!token) return false;

  // Service-role bypass
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && token === serviceRoleKey) return true;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return false;

  const userId = userData.user.id;
  const { data: employee, error: empError } = await supabaseAdmin
    .from("employees")
    .select("id, roles(code)")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (empError || !employee) return false;

  const roleCode = (employee as any)?.roles?.code as string | null;
  return roleCode === "admin";
}

/**
 * Resolve the ID of the role given a role code string (e.g., "user", "admin").
 */
async function resolveRoleId(roleCode: string): Promise<any | null> {
  const { data, error } = await supabaseAdmin
    .from("roles")
    .select("id")
    .eq("code", roleCode)
    .maybeSingle();

  if (error || !data) return null;
  return (data as any).id;
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
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const emailRaw = (body?.email ?? "").toString().trim().toLowerCase();
    const roleRaw = (body?.role ?? "user").toString().trim();
    const firstName = (body?.first_name ?? "").toString().trim();
    const lastName = (body?.last_name ?? "").toString().trim();

    if (!emailRaw || !isValidEmail(emailRaw)) {
      return jsonResponse({ error: "Invalid email" }, { status: 400 });
    }

    if (!roleRaw || !ALLOWED_ROLES.has(roleRaw)) {
      return jsonResponse({ error: "Invalid role" }, { status: 400 });
    }

    if (!firstName) {
      return jsonResponse({ error: "first_name is required" }, { status: 400 });
    }

    // Resolve role ID from the roles table.
    const roleId = await resolveRoleId(roleRaw);
    if (!roleId) {
      return jsonResponse(
        { error: `Role '${roleRaw}' not found in the roles table.` },
        { status: 422 },
      );
    }

    // Check for duplicate employee record.
    const { data: existingEmployee, error: existingEmpError } = await supabaseAdmin
      .from("employees")
      .select("id")
      .eq("email", emailRaw)
      .maybeSingle();

    if (existingEmpError) {
      return jsonResponse({ error: existingEmpError.message }, { status: 500 });
    }

    if (existingEmployee) {
      return jsonResponse({ error: "User with this email already exists" }, { status: 409 });
    }

    // Create auth user
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: emailRaw,
      email_confirm: true,
    });

    if (createError || !created?.user) {
      const message = createError?.message ?? "Failed to create user";
      const status = /already/i.test(message) ? 409 : 500;
      return jsonResponse({ error: message }, { status });
    }

    const userId = created.user.id;

    // Provision the employee record.
    const { data: employeeRow, error: upsertEmpError } = await supabaseAdmin
      .from("employees")
      .upsert(
        {
          auth_user_id: userId,
          email: emailRaw,
          first_name: firstName,
          last_name: lastName || null,
          role_id: roleId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" },
      )
      .select("id, email, first_name, last_name, role_id")
      .maybeSingle();

    if (upsertEmpError) {
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
