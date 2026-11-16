import test from "node:test";
import assert from "node:assert/strict";
import {
  AttachmentQueue,
  validateImage,
  validateImageHeader,
} from "./attachments";

function encoded(
  kind: "png" | "jpeg" | "webp-x" | "webp-l" | "webp-vp8",
  width: number,
  height: number,
) {
  const bytes = new Uint8Array(40),
    view = new DataView(bytes.buffer);
  const put = (at: number, text: string) =>
    bytes.set(
      Array.from(text, (letter) => letter.charCodeAt(0)),
      at,
    );
  let mime: string;
  if (kind === "png") {
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    put(12, "IHDR");
    view.setUint32(16, width);
    view.setUint32(20, height);
    mime = "image/png";
  } else if (kind === "jpeg") {
    bytes.set([0xff, 0xd8, 0xff, 0xe1, 0, 4, 7, 8, 0xff, 0xc2, 0, 8, 8]);
    view.setUint16(13, height);
    view.setUint16(15, width);
    mime = "image/jpeg";
  } else {
    put(0, "RIFF");
    put(8, "WEBP");
    mime = "image/webp";
    if (kind === "webp-x") {
      put(12, "VP8X");
      for (let i = 0; i < 3; i++) {
        bytes[24 + i] = ((width - 1) >>> (i * 8)) & 255;
        bytes[27 + i] = ((height - 1) >>> (i * 8)) & 255;
      }
    } else if (kind === "webp-l") {
      put(12, "VP8L");
      bytes[20] = 0x2f;
      view.setUint32(21, ((width - 1) | ((height - 1) << 14)) >>> 0, true);
    } else {
      put(12, "VP8 ");
      bytes.set([0x9d, 0x01, 0x2a], 23);
      view.setUint16(26, width, true);
      view.setUint16(28, height, true);
    }
  }
  return new File([bytes], `${kind}.image`, { type: mime });
}

for (const kind of ["png", "jpeg", "webp-x", "webp-l", "webp-vp8"] as const)
  test(`${kind} oversized compressed dimensions fail before browser decoding`, async () => {
    const previous = globalThis.createImageBitmap;
    let decodes = 0;
    globalThis.createImageBitmap = (async () => {
      decodes++;
      return { width: 1, height: 1, close() {} };
    }) as typeof createImageBitmap;
    try {
      await assert.rejects(validateImage(encoded(kind, 10000, 10000)), /화소/);
      assert.equal(decodes, 0);
      await validateImageHeader(encoded(kind, 6000, 4000));
      if (["png", "jpeg", "webp-x"].includes(kind))
        await assert.rejects(
          validateImageHeader(encoded(kind, 20001, 1)),
          /20,000/,
        );
    } finally {
      globalThis.createImageBitmap = previous;
    }
  });

test("header preflight rejects a compressed bomb before creating a preview or starting an upload", async () => {
  const previous = URL.createObjectURL;
  let previews = 0,
    uploads = 0;
  URL.createObjectURL = () => {
    previews++;
    return "blob:unused";
  };
  const queue = new AttachmentQueue(
    async () => {
      uploads++;
      return "unexpected";
    },
    () => {},
  );
  try {
    queue.add([encoded("png", 100000, 100000)]);
    assert.equal(queue.items[0].preview, undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(queue.items[0].phase, "error");
    assert.equal(previews, 0);
    assert.equal(uploads, 0);
  } finally {
    queue.dispose();
    URL.createObjectURL = previous;
  }
});

test("header preparation gives every image a preview while network uploads remain blocked", async () => {
  let uploads = 0;
  const queue = new AttachmentQueue(
    async () => {
      uploads++;
      return new Promise<string>(() => {});
    },
    () => {},
  );
  try {
    queue.add(
      Array.from({ length: 20 }, (_, index) => {
        const source = encoded("png", 40, 30);
        return new File([source], `${index}.png`, { type: source.type });
      }),
    );
    for (
      let attempt = 0;
      attempt < 25 && queue.items.some((item) => !item.preview);
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(queue.items.filter((item) => !!item.preview).length, 20);
    assert.equal(uploads, 2);
  } finally {
    queue.dispose();
  }
});
