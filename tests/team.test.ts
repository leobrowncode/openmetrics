import { describe, expect, it } from "vitest";
import { addAdminUser, authenticate, changePassword, passwordProblem, removeAdminUser, resolveSession } from "@/server/auth/admin";
import { adminUsers } from "@/server/db/schema";
import { testDb } from "./helpers";

describe("admin team management", () => {
  it("adds admins once per email (case-insensitive)", async () => {
    const db = await testDb();
    expect(await addAdminUser(db, "Owner@Agence.fr", "a-very-long-password")).toBe(true);
    expect(await addAdminUser(db, "owner@agence.fr", "another-long-password")).toBe(false);
    expect(await authenticate(db, "owner@agence.fr", "a-very-long-password")).not.toBeNull();
  });

  it("enforces a minimum password length", () => {
    expect(passwordProblem("short")).not.toBeNull();
    expect(passwordProblem("twelve-chars")).toBeNull();
  });

  it("changes the password and ends the other sessions only", async () => {
    const db = await testDb();
    await addAdminUser(db, "owner@agence.fr", "initial-password-1");
    const laptop = (await authenticate(db, "owner@agence.fr", "initial-password-1"))!;
    const phone = (await authenticate(db, "owner@agence.fr", "initial-password-1"))!;

    expect(await changePassword(db, laptop.identity.userId, "wrong-password", "new-password-2026", laptop.token)).toBe("invalid");
    expect(await changePassword(db, laptop.identity.userId, "initial-password-1", "new-password-2026", laptop.token)).toBe("ok");

    expect(await resolveSession(db, laptop.token)).not.toBeNull();
    expect(await resolveSession(db, phone.token)).toBeNull();
    expect(await authenticate(db, "owner@agence.fr", "initial-password-1")).toBeNull();
    expect(await authenticate(db, "owner@agence.fr", "new-password-2026")).not.toBeNull();
  });

  it("rate limits password change attempts", async () => {
    const db = await testDb();
    await addAdminUser(db, "owner@agence.fr", "initial-password-1");
    const session = (await authenticate(db, "owner@agence.fr", "initial-password-1"))!;
    for (let i = 0; i < 8; i++) {
      await changePassword(db, session.identity.userId, "wrong-password", "new-password-2026", session.token);
    }
    expect(await changePassword(db, session.identity.userId, "initial-password-1", "new-password-2026", session.token)).toBe("rate_limited");
  });

  it("removes another admin and revokes their sessions immediately, but never the last or oneself", async () => {
    const db = await testDb();
    await addAdminUser(db, "owner@agence.fr", "initial-password-1");
    await addAdminUser(db, "freelance@agence.fr", "initial-password-2");
    const owner = (await authenticate(db, "owner@agence.fr", "initial-password-1"))!;
    const freelance = (await authenticate(db, "freelance@agence.fr", "initial-password-2"))!;

    expect(await removeAdminUser(db, owner.identity.userId, owner.identity.userId)).toBe("self");
    expect(await removeAdminUser(db, owner.identity.userId, freelance.identity.userId)).toBe("ok");
    expect(await resolveSession(db, freelance.token)).toBeNull();
    expect(await db.select().from(adminUsers)).toHaveLength(1);
    expect(await removeAdminUser(db, freelance.identity.userId, owner.identity.userId)).toBe("last");
  });
});
