import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";

type Role = Database["public"]["Enums"]["app_role"];
type TestUser = {
  email: string;
  id: string;
  password: string;
  role: Role | null;
  client: SupabaseClient<Database>;
};

const runRlsTests = process.env.RUN_RLS_INTEGRATION_TESTS === "true";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const roles: Role[] = ["operador", "qualidade", "gestor", "admin"];
const testRunId = `rls-${Date.now()}-${randomUUID().slice(0, 8)}`;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name} for RLS integration tests.`);
  return value;
}

function makeClient(key: string): SupabaseClient<Database> {
  return createClient<Database>(requireEnv("SUPABASE_URL", supabaseUrl), key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function expectPermissionError(error: { message?: string; code?: string } | null) {
  expect(error, "expected Supabase to reject the operation").toBeTruthy();
  expect(`${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase()).toMatch(
    /permission|denied|not allowed|not found|schema cache|pgrst|42501|401|403/,
  );
}

if (!runRlsTests) {
  describe.skip("Supabase RLS and role authorization", () => {
    it("requires RUN_RLS_INTEGRATION_TESTS=true", () => undefined);
  });
} else {
  describe("Supabase RLS and role authorization", () => {
    const service = makeClient(requireEnv("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey));
    const anon = makeClient(requireEnv("SUPABASE_ANON_KEY/SUPABASE_PUBLISHABLE_KEY", anonKey));
    const users = new Map<Role | "no-role", TestUser>();
    const ticketIds: string[] = [];

    async function createTestUser(role: Role | null): Promise<TestUser> {
      const email = `${testRunId}-${role ?? "no-role"}@example.invalid`;
      const password = `T3st-${randomUUID()}!`;
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { test_run_id: testRunId },
      });
      if (error || !data.user) throw error ?? new Error(`Could not create ${email}`);

      const client = makeClient(requireEnv("SUPABASE_ANON_KEY/SUPABASE_PUBLISHABLE_KEY", anonKey));
      const signIn = await client.auth.signInWithPassword({ email, password });
      if (signIn.error) throw signIn.error;

      await service.from("user_roles").delete().eq("user_id", data.user.id);
      if (role) {
        const { error: roleError } = await service
          .from("user_roles")
          .insert({ user_id: data.user.id, role });
        if (roleError) throw roleError;
      }

      return { email, id: data.user.id, password, role, client };
    }

    async function createTicket(createdBy: string) {
      const id = randomUUID();
      const { error } = await service.from("tickets").insert({
        id,
        code: `RLS-${testRunId}-${ticketIds.length + 1}`,
        customer: `Cliente teste ${testRunId}`,
        part: "Peca teste RLS",
        part_code: `PART-${testRunId}`,
        reason: "Teste de autorizacao RLS",
        priority: "media",
        status: "aberto",
        created_by: createdBy,
      });
      if (error) throw error;
      ticketIds.push(id);
      return id;
    }

    beforeAll(async () => {
      for (const role of roles) {
        users.set(role, await createTestUser(role));
      }
      users.set("no-role", await createTestUser(null));
      await createTicket(users.get("operador")!.id);
    });

    afterAll(async () => {
      if (!runRlsTests) return;

      if (ticketIds.length > 0) {
        await service.from("tickets").delete().in("id", ticketIds);
      }

      const userIds = [...users.values()].map((user) => user.id);
      if (userIds.length > 0) {
        await service.from("user_roles").delete().in("user_id", userIds);
        await service.from("profiles").delete().in("user_id", userIds);
      }

      await Promise.allSettled(
        [...users.values()].map((user) => service.auth.admin.deleteUser(user.id)),
      );
    });

    it("has_role returns true only for the assigned role", async () => {
      for (const [key, user] of users) {
        for (const role of roles) {
          const { data, error } = await service.rpc("has_role", {
            _user_id: user.id,
            _role: role,
          });

          expect(error).toBeNull();
          expect(data, `${key} / ${role}`).toBe(user.role === role);
        }
      }

      const { data, error } = await service.rpc("has_role", {
        _user_id: randomUUID(),
        _role: "admin",
      });
      expect(error).toBeNull();
      expect(data).toBe(false);
    });

    it("anon cannot read central tables or call privileged functions", async () => {
      const ticketRead = await anon.from("tickets").select("id").in("id", ticketIds);
      if (ticketRead.error) expectPermissionError(ticketRead.error);
      else expect(ticketRead.data).toEqual([]);

      const roleRead = await anon.from("user_roles").select("user_id, role").limit(1);
      if (roleRead.error) expectPermissionError(roleRead.error);
      else expect(roleRead.data).toEqual([]);

      const insertAttempt = await anon.from("tickets").insert({
        customer: "Anon RLS",
        part: "Peca",
        part_code: "ANON",
        reason: "Nao deve inserir",
      });
      expectPermissionError(insertAttempt.error);

      const rpcChecks = [
        anon.rpc("has_role", { _user_id: users.get("admin")!.id, _role: "admin" }),
        anon.rpc("get_user_id_by_email", { email_input: users.get("admin")!.email }),
        anon.rpc("notify_vpclick_ticket"),
        anon.rpc("notify_vpclick_interno"),
        anon.rpc("on_auth_user_created"),
      ];

      for (const rpc of rpcChecks) {
        const { error } = await rpc;
        expectPermissionError(error);
      }
    });

    it("authenticated user without role cannot access tickets or user_roles", async () => {
      const user = users.get("no-role")!;

      const ticketRead = await user.client.from("tickets").select("id").in("id", ticketIds);
      expect(ticketRead.error).toBeNull();
      expect(ticketRead.data).toEqual([]);

      const ticketUpdate = await user.client
        .from("tickets")
        .update({ reason: "blocked by RLS" })
        .in("id", ticketIds)
        .select("id");
      expect(ticketUpdate.error).toBeNull();
      expect(ticketUpdate.data).toEqual([]);

      const ticketDelete = await user.client
        .from("tickets")
        .delete()
        .in("id", ticketIds)
        .select("id");
      expect(ticketDelete.error).toBeNull();
      expect(ticketDelete.data).toEqual([]);

      const rolesRead = await user.client.from("user_roles").select("user_id, role").limit(10);
      expect(rolesRead.error).toBeNull();
      expect(rolesRead.data).toEqual([]);

      const rolesUpdate = await user.client
        .from("user_roles")
        .update({ role: "admin" })
        .eq("user_id", user.id)
        .select("user_id");
      expect(rolesUpdate.error).toBeNull();
      expect(rolesUpdate.data).toEqual([]);
    });

    it("operational roles can read and update tickets but cannot delete them", async () => {
      for (const role of ["operador", "qualidade", "gestor"] as const) {
        const user = users.get(role)!;

        const read = await user.client.from("tickets").select("id").in("id", ticketIds);
        expect(read.error).toBeNull();
        expect(read.data).toHaveLength(ticketIds.length);

        const update = await user.client
          .from("tickets")
          .update({ reason: `Atualizado por ${role}` })
          .in("id", ticketIds)
          .select("id");
        expect(update.error).toBeNull();
        expect(update.data).toHaveLength(ticketIds.length);

        const deleteAttempt = await user.client
          .from("tickets")
          .delete()
          .in("id", ticketIds)
          .select("id");
        expect(deleteAttempt.error).toBeNull();
        expect(deleteAttempt.data).toEqual([]);
      }
    });

    it("admin can read, update, and delete tickets", async () => {
      const admin = users.get("admin")!;
      const ticketId = await createTicket(admin.id);

      const read = await admin.client.from("tickets").select("id").eq("id", ticketId);
      expect(read.error).toBeNull();
      expect(read.data).toHaveLength(1);

      const update = await admin.client
        .from("tickets")
        .update({ reason: "Atualizado por admin" })
        .eq("id", ticketId)
        .select("id");
      expect(update.error).toBeNull();
      expect(update.data).toHaveLength(1);

      const deleted = await admin.client.from("tickets").delete().eq("id", ticketId).select("id");
      expect(deleted.error).toBeNull();
      expect(deleted.data).toHaveLength(1);
      ticketIds.splice(ticketIds.indexOf(ticketId), 1);
    });

    it("only admin can manage user_roles", async () => {
      const operador = users.get("operador")!;
      const admin = users.get("admin")!;
      const noRole = users.get("no-role")!;

      const operadorInsert = await operador.client
        .from("user_roles")
        .insert({ user_id: noRole.id, role: "operador" })
        .select("user_id");
      expectPermissionError(operadorInsert.error);

      const adminRead = await admin.client
        .from("user_roles")
        .select("user_id, role")
        .eq("user_id", operador.id);
      expect(adminRead.error).toBeNull();
      expect(adminRead.data).toEqual([{ user_id: operador.id, role: "operador" }]);

      const adminInsert = await admin.client
        .from("user_roles")
        .insert({ user_id: noRole.id, role: "operador" })
        .select("user_id, role");
      expect(adminInsert.error).toBeNull();
      expect(adminInsert.data).toEqual([{ user_id: noRole.id, role: "operador" }]);

      const adminDelete = await admin.client
        .from("user_roles")
        .delete()
        .eq("user_id", noRole.id)
        .eq("role", "operador")
        .select("user_id, role");
      expect(adminDelete.error).toBeNull();
      expect(adminDelete.data).toEqual([{ user_id: noRole.id, role: "operador" }]);
    });
  });
}
