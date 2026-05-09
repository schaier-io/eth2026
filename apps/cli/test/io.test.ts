import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliError } from "../src/errors.js";
import { emitError, emitNdjson, emitResult } from "../src/io.js";

describe("io.emitResult", () => {
  let stdout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stdout.mockRestore();
  });

  it("--json wraps the data in {ok:true,data:...}", () => {
    emitResult({ json: true, yes: false }, { foo: "bar", n: 42 });
    expect(stdout).toHaveBeenCalledOnce();
    const written = String(stdout.mock.calls[0]?.[0]);
    expect(JSON.parse(written.trim())).toEqual({
      ok: true,
      data: { foo: "bar", n: 42 },
    });
  });

  it("--json serializes bigint as decimal string", () => {
    emitResult({ json: true, yes: false }, { stake: 12345n, nested: { x: 1n } });
    const out = String(stdout.mock.calls[0]?.[0]);
    expect(JSON.parse(out.trim())).toEqual({
      ok: true,
      data: { stake: "12345", nested: { x: "1" } },
    });
  });

  it("--json serializes bigint inside arrays", () => {
    emitResult({ json: true, yes: false }, { ws: [1n, 2n, 3n] });
    const out = String(stdout.mock.calls[0]?.[0]);
    expect(JSON.parse(out.trim())).toEqual({
      ok: true,
      data: { ws: ["1", "2", "3"] },
    });
  });

  it("non-JSON mode invokes the pretty callback instead of writing JSON", () => {
    const pretty = vi.fn();
    emitResult({ json: false, yes: false }, { foo: "bar" }, pretty);
    expect(pretty).toHaveBeenCalledOnce();
    expect(stdout).not.toHaveBeenCalled();
  });

  it("non-JSON mode without pretty falls back to JSON.stringify(2) on stdout", () => {
    emitResult({ json: false, yes: false }, { foo: "bar" });
    expect(stdout).toHaveBeenCalledOnce();
    const out = String(stdout.mock.calls[0]?.[0]);
    expect(out).toContain('"foo": "bar"');
  });
});

describe("io.emitError", () => {
  let stderr: ReturnType<typeof vi.spyOn>;
  let exit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`__exit_${code ?? 0}__`);
    }) as never);
  });
  afterEach(() => {
    stderr.mockRestore();
    exit.mockRestore();
  });

  it("--json emits {ok:false,error:{code,message}} on stderr and exits with err.exitCode", () => {
    expect(() =>
      emitError(
        { json: true, yes: false },
        new CliError("BOOM", "kaboom message", 2),
      ),
    ).toThrow(/__exit_2__/);
    expect(stderr).toHaveBeenCalledOnce();
    const out = String(stderr.mock.calls[0]?.[0]);
    expect(JSON.parse(out.trim())).toEqual({
      ok: false,
      error: { code: "BOOM", message: "kaboom message" },
    });
  });

  it("non-JSON emits a one-liner with the code and message", () => {
    expect(() =>
      emitError(
        { json: false, yes: false },
        new CliError("OOPS", "human message"),
      ),
    ).toThrow(/__exit_1__/);
    const out = String(stderr.mock.calls[0]?.[0]);
    expect(out).toBe("error [OOPS]: human message\n");
  });
});

describe("io.emitNdjson", () => {
  let stdout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stdout.mockRestore();
  });

  it("emits one JSON object per call, terminated with newline, bigints stringified", () => {
    emitNdjson({ event: "tick", n: 1n });
    emitNdjson({ event: "stop" });
    expect(stdout).toHaveBeenCalledTimes(2);
    const lines = stdout.mock.calls.map((c) => String(c[0]).trim());
    expect(JSON.parse(lines[0]!)).toEqual({ event: "tick", n: "1" });
    expect(JSON.parse(lines[1]!)).toEqual({ event: "stop" });
  });
});
