import { expect } from "vitest";

import type { SwarmKvStore, SwarmKvValue, SwarmKvValueKind } from "../src/index.js";
import { byteLength, logE2eRead, traceE2ePut } from "./e2e-log.js";

export interface FileTypeCase {
  name: string;
  key: string;
  value: SwarmKvValue;
  options?: {
    contentType: string;
  };
  expectedContentType: string;
  expectedKind: SwarmKvValueKind;
  expectedValue?: unknown;
  expectedBytes?: Uint8Array;
  bytes: number;
}

const jsonDocument = {
  schema: "example.profile.v1",
  name: "Ada Lovelace",
  links: ["https://docs.ethswarm.org/"]
};
const markdown = "# Swarm Note\n\nA markdown document stored by key.\n";
const svgBytes = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>'
);
const pdfBytes = new TextEncoder().encode("%PDF-1.7\n% fake pdf fixture for e2e\n");
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
]);
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const mp4Bytes = new TextEncoder().encode("\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom");
const webmBytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);

export const FILE_TYPE_CASES: FileTypeCase[] = [
  {
    name: "JSON metadata file",
    key: "file:profile.json",
    value: jsonDocument,
    options: { contentType: "application/vnd.truthmarket.profile+json" },
    expectedContentType: "application/vnd.truthmarket.profile+json",
    expectedKind: "json",
    expectedValue: jsonDocument,
    bytes: byteLength(JSON.stringify(jsonDocument))
  },
  {
    name: "Markdown text file",
    key: "file:note.md",
    value: markdown,
    options: { contentType: "text/markdown;charset=utf-8" },
    expectedContentType: "text/markdown;charset=utf-8",
    expectedKind: "string",
    expectedValue: markdown,
    bytes: byteLength(markdown)
  },
  {
    name: "SVG image file",
    key: "file:icon.svg",
    value: svgBytes,
    options: { contentType: "image/svg+xml" },
    expectedContentType: "image/svg+xml",
    expectedKind: "bytes",
    expectedBytes: svgBytes,
    bytes: svgBytes.byteLength
  },
  {
    name: "PDF document file",
    key: "file:document.pdf",
    value: new Blob([pdfBytes], { type: "application/pdf" }),
    expectedContentType: "application/pdf",
    expectedKind: "bytes",
    expectedBytes: pdfBytes,
    bytes: pdfBytes.byteLength
  },
  {
    name: "PNG image file",
    key: "media:image.png",
    value: pngBytes,
    options: { contentType: "image/png" },
    expectedContentType: "image/png",
    expectedKind: "bytes",
    expectedBytes: pngBytes,
    bytes: pngBytes.byteLength
  },
  {
    name: "JPEG image file",
    key: "media:photo.jpg",
    value: new Blob([jpegBytes], { type: "image/jpeg" }),
    expectedContentType: "image/jpeg",
    expectedKind: "bytes",
    expectedBytes: jpegBytes,
    bytes: jpegBytes.byteLength
  },
  {
    name: "MP4 video file",
    key: "media:clip.mp4",
    value: mp4Bytes,
    options: { contentType: "video/mp4" },
    expectedContentType: "video/mp4",
    expectedKind: "bytes",
    expectedBytes: mp4Bytes,
    bytes: mp4Bytes.byteLength
  },
  {
    name: "WebM video file",
    key: "media:clip.webm",
    value: new Blob([webmBytes], { type: "video/webm" }),
    expectedContentType: "video/webm",
    expectedKind: "bytes",
    expectedBytes: webmBytes,
    bytes: webmBytes.byteLength
  }
];

export async function assertFileTypeRoundTrip(store: SwarmKvStore, fileCase: FileTypeCase): Promise<void> {
  await traceE2ePut(
    {
      key: fileCase.key,
      fileType: fileCase.name,
      contentType: fileCase.expectedContentType,
      expectedKind: fileCase.expectedKind,
      bytes: fileCase.bytes
    },
    () => store.put(fileCase.key, fileCase.value, fileCase.options)
  );

  const result = await store.get(fileCase.key);

  logE2eRead(result, {
    key: fileCase.key,
    fileType: fileCase.name,
    expectedContentType: fileCase.expectedContentType,
    expectedKind: fileCase.expectedKind
  });

  expect(result?.contentType).toBe(fileCase.expectedContentType);
  expect(result?.kind).toBe(fileCase.expectedKind);

  if (fileCase.expectedBytes) {
    expect(result?.bytes).toEqual(fileCase.expectedBytes);
  } else {
    expect(result?.value).toEqual(fileCase.expectedValue);
  }
}
