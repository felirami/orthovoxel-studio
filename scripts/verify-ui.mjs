import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:5173/";
const outputDir = new URL("../artifacts/", import.meta.url);

async function verifyViewport(page, name, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Examples" }).click();
  await page.waitForFunction(() => {
    const text = document.querySelector(".status-strip")?.textContent ?? "";
    return text.includes("voxels") && !text.includes("0 voxels");
  });

  const canvasCheck = await page.locator("canvas").evaluate((canvas) => {
    const gl =
      canvas.getContext("webgl2", { preserveDrawingBuffer: true }) ??
      canvas.getContext("webgl", { preserveDrawingBuffer: true });

    if (!gl) {
      return { ok: false, reason: "No WebGL context" };
    }

    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let nonBackground = 0;
    let opaque = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const a = pixels[index + 3];

      if (a > 0) {
        opaque += 1;
      }

      if (Math.abs(r - 23) + Math.abs(g - 24) + Math.abs(b - 22) > 18) {
        nonBackground += 1;
      }
    }

    return {
      ok: nonBackground > 1000,
      nonBackground,
      opaque,
      width,
      height
    };
  });

  if (!canvasCheck.ok) {
    throw new Error(`${name} canvas check failed: ${JSON.stringify(canvasCheck)}`);
  }

  const overlaps = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("button, .floating-upload, .status-strip span"));
    const rects = nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          text: node.textContent?.trim() ?? node.getAttribute("title") ?? node.tagName,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        };
      })
      .filter((rect) => rect.width > 8 && rect.height > 8);

    return rects.flatMap((a, index) =>
      rects.slice(index + 1).flatMap((b) => {
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const overlapArea = Math.max(0, overlapX) * Math.max(0, overlapY);

        if (overlapArea > 120 && a.text !== b.text) {
          return [{ a: a.text, b: b.text, overlapArea: Math.round(overlapArea) }];
        }

        return [];
      })
    );
  });

  await page.screenshot({ path: new URL(`${name}.png`, outputDir).pathname, fullPage: true });
  return { canvasCheck, overlaps: overlaps.slice(0, 8) };
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();

try {
  const page = await browser.newPage();
  const desktop = await verifyViewport(page, "desktop", { width: 1440, height: 920 });
  const mobile = await verifyViewport(page, "mobile", { width: 390, height: 900 });
  console.log(JSON.stringify({ desktop, mobile }, null, 2));
} finally {
  await browser.close();
}
