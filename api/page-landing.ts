import type { VercelRequest, VercelResponse } from "@vercel/node";
import { regenerateLanding } from "../src/landing.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const maxDuration = 30;

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    await regenerateLanding();
    const html = await readFile(resolve("public/index.html"), "utf8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`page-landing 실패: ${msg}`);
    res.status(500).send(`<pre>${msg}</pre>`);
  }
}
