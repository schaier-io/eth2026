import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { atomicWriteFile } from "../src/util/atomic.js";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "tm-cli-atomic-"));
}

describe("atomicWriteFile", () => {
  it("writes content to the target path", async () => {
    const dir = tempDir();
    const target = path.join(dir, "target.json");
    await atomicWriteFile(target, '{"hello":"world"}\n');
    expect(readFileSync(target, "utf8")).toBe('{"hello":"world"}\n');
  });

  it("leaves no .tmp.* sibling after a successful write", async () => {
    const dir = tempDir();
    const target = path.join(dir, "data.json");
    await atomicWriteFile(target, "ok");
    const entries = readdirSync(dir);
    expect(entries).toEqual(["data.json"]);
  });

  it("respects the requested mode", async () => {
    const dir = tempDir();
    const target = path.join(dir, "secret.json");
    await atomicWriteFile(target, "x", 0o600);
    const stat = statSync(target);
    // mask out file type bits, only check perm bits
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("overwrites an existing target atomically", async () => {
    const dir = tempDir();
    const target = path.join(dir, "data.json");
    await atomicWriteFile(target, "first");
    await atomicWriteFile(target, "second");
    expect(readFileSync(target, "utf8")).toBe("second");
    expect(readdirSync(dir)).toEqual(["data.json"]);
  });

  it("supports concurrent writers without colliding (different tmp suffixes)", async () => {
    const dir = tempDir();
    const target = path.join(dir, "data.json");
    // Start many concurrent writes; whoever wins last sets the file. None
    // should leave behind tmp files because each rename removes its own tmp.
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        atomicWriteFile(target, `payload-${i}`),
      ),
    );
    expect(readdirSync(dir)).toEqual(["data.json"]);
    expect(readFileSync(target, "utf8")).toMatch(/^payload-\d+$/);
  });
});
