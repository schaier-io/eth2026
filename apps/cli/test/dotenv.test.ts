import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDotenv, parseDotenv } from "../src/util/dotenv.js";

describe("parseDotenv", () => {
  it("parses basic KEY=value pairs", () => {
    expect(parseDotenv("FOO=bar\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("strips comments and blank lines", () => {
    const input = `# comment
FOO=bar

# another
BAZ=qux
`;
    expect(parseDotenv(input)).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("strips wrapping double or single quotes", () => {
    expect(parseDotenv('FOO="bar baz"\nQUX=\'spaced value\'')).toEqual({
      FOO: "bar baz",
      QUX: "spaced value",
    });
  });

  it("ignores invalid keys (dashes, leading digits, etc)", () => {
    expect(parseDotenv("FOO=ok\nWITH-DASH=skip\n9START=skip\n")).toEqual({
      FOO: "ok",
    });
  });

  it("permits lowercase keys (common .env convention)", () => {
    expect(parseDotenv("foo=ok\nMixed_Case=ok2\n")).toEqual({
      foo: "ok",
      Mixed_Case: "ok2",
    });
  });

  it("ignores lines without an equals sign", () => {
    expect(parseDotenv("not-a-pair\nFOO=bar\n")).toEqual({ FOO: "bar" });
  });

  it("trims whitespace around key and value", () => {
    expect(parseDotenv("  FOO  =  bar  \n")).toEqual({ FOO: "bar" });
  });

  it("ignores keys that are blank (line starts with =)", () => {
    expect(parseDotenv("=value\nFOO=bar\n")).toEqual({ FOO: "bar" });
  });
});

describe("loadDotenv", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.TM_TEST_VAR;
    delete process.env.TM_TEST_KEEP;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("loads from cwd and writes only-missing keys to process.env", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tm-cli-dotenv-"));
    writeFileSync(
      path.join(dir, ".env"),
      "TM_TEST_VAR=from_dotenv\nTM_TEST_KEEP=should_be_overridden\n",
    );
    process.env.TM_TEST_KEEP = "shell_value"; // explicit shell wins
    const r = loadDotenv({ startDir: dir });
    expect(r.path).toBe(path.join(dir, ".env"));
    expect(process.env.TM_TEST_VAR).toBe("from_dotenv");
    expect(process.env.TM_TEST_KEEP).toBe("shell_value");
    expect(r.applied).toContain("TM_TEST_VAR");
    expect(r.applied).not.toContain("TM_TEST_KEEP");
  });

  it("walks up parent directories until it finds .env", () => {
    const root = mkdtempSync(path.join(tmpdir(), "tm-cli-dotenv-walk-"));
    writeFileSync(path.join(root, ".env"), "TM_TEST_VAR=parent\n");
    const nested = path.join(root, "a", "b", "c");
    mkdirSync(nested, { recursive: true });

    const r = loadDotenv({ startDir: nested });
    expect(r.path).toBe(path.join(root, ".env"));
    expect(process.env.TM_TEST_VAR).toBe("parent");
  });

  it("returns null path when no .env exists in the walked range", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tm-cli-dotenv-empty-"));
    const r = loadDotenv({ startDir: dir, maxDepth: 1 });
    expect(r.path).toBeNull();
    expect(r.parsed).toEqual({});
  });

  it("treats empty-string env as missing (overwritable)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tm-cli-dotenv-empty-shell-"));
    writeFileSync(path.join(dir, ".env"), "TM_TEST_VAR=from_dotenv\n");
    process.env.TM_TEST_VAR = "";
    loadDotenv({ startDir: dir });
    expect(process.env.TM_TEST_VAR).toBe("from_dotenv");
  });
});
