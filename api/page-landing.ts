import type { VercelRequest, VercelResponse } from "@vercel/node";
import { regenerateLanding } from "../src/landing.js";

export const maxDuration = 30;

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const html = await regenerateLanding();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(html);
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`page-landing 실패: ${msg}`);
    res.status(500).send(`<pre>${msg}</pre>`);
  }
}
