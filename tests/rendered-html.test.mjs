import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("exports BBCal as a static page", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>BBCal/);
  assert.match(html, /BBCal/);
  assert.match(html, /_next\/static/);
});
