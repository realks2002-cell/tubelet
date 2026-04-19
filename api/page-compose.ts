import type { VercelRequest, VercelResponse } from "@vercel/node";
import { renderComposePage } from "../src/compose-page.js";

export const maxDuration = 10;

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(renderComposePage());
}
