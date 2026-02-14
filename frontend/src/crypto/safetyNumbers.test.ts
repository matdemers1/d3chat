import { describe, it, expect } from "vitest";
import { generateSafetyNumber } from "./safetyNumbers";
import { arrayBufferToBase64 } from "./keys";

describe("safetyNumbers", () => {
  const keyA = arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const keyB = arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(32)).buffer);

  it("generates a string of space-separated digit groups", async () => {
    const number = await generateSafetyNumber(keyA, keyB);
    expect(typeof number).toBe("string");
    const groups = number.split(" ");
    expect(groups.length).toBe(12);
    for (const group of groups) {
      expect(group).toMatch(/^\d{5}$/);
    }
  });

  it("is deterministic", async () => {
    const n1 = await generateSafetyNumber(keyA, keyB);
    const n2 = await generateSafetyNumber(keyA, keyB);
    expect(n1).toBe(n2);
  });

  it("is order-independent", async () => {
    const ab = await generateSafetyNumber(keyA, keyB);
    const ba = await generateSafetyNumber(keyB, keyA);
    expect(ab).toBe(ba);
  });

  it("different keys produce different numbers", async () => {
    const keyC = arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(32)).buffer);
    const ab = await generateSafetyNumber(keyA, keyB);
    const ac = await generateSafetyNumber(keyA, keyC);
    expect(ab).not.toBe(ac);
  });
});
