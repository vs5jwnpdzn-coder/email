export const config = { runtime: "nodejs" };

import { kv } from "@vercel/kv";

function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}

function isValidUsername(u) {
  return /^[a-z0-9_-]{3,20}$/.test(u);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const url = new URL(req.url, "http://localhost");
  const username = normalizeUsername(url.searchParams.get("username"));

  if (!username) return res.status(400).json({ ok: false, error: "username fehlt" });
  if (!isValidUsername(username)) return res.status(200).json({ ok: true, available: false });

  try {
    // Beispiel: wenn du users als Set speicherst
    const exists = await kv.sismember("users", username);
    return res.status(200).json({ ok: true, available: !exists });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "kv error", detail: String(e?.message || e) });
  }
}