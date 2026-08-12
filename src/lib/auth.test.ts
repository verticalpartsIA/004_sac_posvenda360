import { describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: getSessionMock } },
}));

const { getSession } = await import("./auth");

describe("getSession", () => {
  it("delega para supabase.auth.getSession()", async () => {
    const fakeResult = { data: { session: null }, error: null };
    getSessionMock.mockResolvedValueOnce(fakeResult);

    const result = await getSession();

    expect(getSessionMock).toHaveBeenCalledOnce();
    expect(result).toBe(fakeResult);
  });
});
