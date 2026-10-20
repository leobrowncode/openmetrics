import { describe, expect, it } from "vitest";
import { createAdminUser, authenticate, resolveSession } from "@/server/auth/admin";
import { decryptSecret, encryptSecret } from "@/server/security/encryption";
import { hashPassword, verifyPassword } from "@/server/security/password";
import { rateLimit } from "@/server/security/rate-limit";
import { hashToken } from "@/server/security/tokens";
import { testDb } from "./helpers";

describe("secret encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("EAAB-token");
    const b = encryptSecret("EAAB-token");
    expect(a).not.toBe(b);
    expect(a).not.toContain("EAAB-token");
    expect(decryptSecret(a)).toBe("EAAB-token");
  });

  it("detects tampering", () => {
    const parts = encryptSecret("EAAB-token").split(".");
    const flipped = parts[3][0] === "A" ? "B" : "A";
    parts[3] = flipped + parts[3].slice(1);
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});

describe("tokens and passwords", () => {
  it("separates fingerprints by purpose", () => {
    expect(hashToken("abc", "share")).not.toBe(hashToken("abc", "session"));
  });

  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("creates sessions only for valid credentials", async () => {
    const db = await testDb();
    await createAdminUser(db, "Admin@Agence.fr", "a-very-long-password");
    expect(await authenticate(db, "admin@agence.fr", "nope")).toBeNull();
    const session = await authenticate(db, "admin@agence.fr", "a-very-long-password");
    expect(session).not.toBeNull();
    expect(await resolveSession(db, session!.token)).toMatchObject({ email: "admin@agence.fr" });
    expect(await resolveSession(db, "x".repeat(43))).toBeNull();
  });
});

describe("rate limiting", () => {
  it("blocks after the limit within a window and resets in the next one", async () => {
    const db = await testDb();
    const now = new Date("2026-10-19T10:00:05Z");
    for (let i = 0; i < 3; i++) {
      expect((await rateLimit(db, "k", 3, 60, now)).allowed).toBe(true);
    }
    const blocked = await rateLimit(db, "k", 3, 60, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(55);
    expect((await rateLimit(db, "k", 3, 60, new Date("2026-10-19T10:01:01Z"))).allowed).toBe(true);
    expect((await rateLimit(db, "other", 3, 60, now)).allowed).toBe(true);
  });
});
