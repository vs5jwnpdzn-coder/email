export const config = { runtime: "nodejs" };

import { kv } from "@vercel/kv";

function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}

function isValidUsername(u) {
  // gleiche Logik wie bei dir: du lowercasest sowieso
  // Regeln: 3–20 Zeichen, nur a-z 0-9 _ -
  return /^[a-z0-9_-]{3,20}$/.test(u);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  const url = new URL(req.url, "http://localhost");
  const username = normalizeUsername(url.searchParams.get("username"));

  if (!username) {
    return res.status(400).json({ ok: false, error: "username fehlt" });
  }

  if (!isValidUsername(username)) {
    return res.status(200).json({
      ok: true,
      available: false,
      reason: "Ungültig (3–20 Zeichen, a-z 0-9 _ -)"
    });
  }

  const existing = await kv.get(`user:${username}`);
  const taken = !!existing;

  return res.status(200).json({
    ok: true,
    available: !taken,
    reason: taken ? "Schon vergeben" : "Verfügbar"
  });
}