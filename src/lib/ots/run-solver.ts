import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type OtsModule = {
  callMain: (args: string[]) => number;
};

type Factory = (options: {
  print: (text: string) => void;
  printErr: (text: string) => void;
}) => Promise<OtsModule> | OtsModule;

/**
 * Load a committed Emscripten build from wasm/ and run it.
 * The import is built at runtime so Next's bundler cannot rewrite it, and
 * the matching .wasm file stays beside the glue on disk.
 */
export async function runSolver(
  program: string,
  args: string[],
): Promise<{ exitCode: number; log: string }> {
  const jsPath = path.join(process.cwd(), "wasm", `${program}.js`);
  const lines: string[] = [];
  const factory = await loadFactory(jsPath);
  const module = await factory({
    print: (text) => lines.push(String(text)),
    printErr: (text) => lines.push(String(text)),
  });

  // NODERAWFS sends C printf through fs.writeSync on fd 1, not the JS
  // print hook. Hold both so a return does not land in the hosting logs.
  // The captured text is only used when a solver fails.
  const restoreStdio = holdSolverOutput(lines);

  // Emscripten's exit() writes process.exitCode before callMain catches it.
  // Put the previous code back so a tax run cannot stop the Next.js server.
  const previousExit = process.exitCode;
  let exitCode = 0;
  try {
    exitCode = module.callMain(args) ?? 0;
  } catch (error) {
    const status = (error as { status?: number; name?: string }).status;
    const name = (error as { name?: string }).name;
    if (name === "ExitStatus" && (status === 0 || status === undefined)) {
      exitCode = 0;
    } else if (typeof status === "number") {
      exitCode = status;
    } else {
      throw error;
    }
  } finally {
    process.exitCode = previousExit;
    restoreStdio();
  }

  return { exitCode, log: lines.join("\n") };
}

async function loadFactory(jsPath: string): Promise<Factory> {
  const href = pathToFileURL(jsPath).href;
  const importer = new Function(
    "href",
    "return import(href)",
  ) as (href: string) => Promise<{ default?: Factory }>;
  const loaded = await importer(href);
  const factory = loaded.default;
  if (typeof factory !== "function") {
    throw new Error(`Could not load the OpenTaxSolver program at ${jsPath}.`);
  }
  return factory;
}

function bytesOf(chunk: unknown, length: unknown): number {
  if (typeof length === "number") return length;
  if (typeof chunk === "string") return Buffer.byteLength(chunk);
  if (chunk instanceof Uint8Array) return chunk.byteLength;
  return 0;
}

/** Emscripten passes a view of the wasm heap. Copy only the written slice. */
function textOf(chunk: unknown, offset?: unknown, length?: unknown): string {
  if (typeof chunk === "string") return chunk;
  if (ArrayBuffer.isView(chunk) && !(chunk instanceof DataView)) {
    const view = chunk;
    const start = typeof offset === "number" ? offset : 0;
    const count =
      typeof length === "number" ? length : Math.max(0, view.byteLength - start);
    return Buffer.from(view.buffer, view.byteOffset + start, count).toString();
  }
  return "";
}

function holdSolverOutput(bucket: string[]): () => void {
  const writeSync = fs.writeSync;
  const write = fs.write;
  const stdoutWrite = process.stdout.write;
  const stderrWrite = process.stderr.write;

  fs.writeSync = ((fd: number, chunk: unknown, ...rest: unknown[]) => {
    if (fd === 1 || fd === 2) {
      bucket.push(textOf(chunk, rest[0], rest[1]));
      return bytesOf(chunk, rest[1]);
    }
    return (writeSync as (...args: unknown[]) => number).call(fs, fd, chunk, ...rest);
  }) as typeof fs.writeSync;

  fs.write = ((fd: number, chunk: unknown, ...rest: unknown[]) => {
    if (fd === 1 || fd === 2) {
      bucket.push(textOf(chunk, rest[0], rest[1]));
      const done = rest.find((arg) => typeof arg === "function") as
        | ((error?: Error | null) => void)
        | undefined;
      if (done) done();
      return true;
    }
    return (write as (...args: unknown[]) => unknown).call(fs, fd, chunk, ...rest);
  }) as typeof fs.write;

  const captureStream = (streamWrite: typeof process.stdout.write) =>
    ((chunk: string | Uint8Array, encoding?: unknown, callback?: unknown) => {
      bucket.push(textOf(chunk));
      const done = typeof encoding === "function" ? encoding : callback;
      if (typeof done === "function") done();
      return true;
    }) as typeof streamWrite;

  process.stdout.write = captureStream(stdoutWrite);
  process.stderr.write = captureStream(stderrWrite);

  return () => {
    fs.writeSync = writeSync;
    fs.write = write;
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  };
}
