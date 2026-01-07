export const config = { runtime: "nodejs" };

import { kv } from "@vercel/kv";
import { jwtVerify } from "jose";

function getCookie(req, name) {
  const cookie = req.headers.cookie || "";
  const parts = cookie.split(";").map(p => p.trim());
  const found = parts.find(p => p.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : "";
}

async function getUsername(req) {
  const token = getCookie(req, "token");
  if (!token) return null;

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);

  // ✅ wichtig: immer lower-case, damit keys matchen
  return String(payload.username || "").trim().toLowerCase();
}

export default async function handler(req, res) {
  // ✅ Cache aus, damit du sofort neue Nachrichten siehst
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  try {
    const username = await getUsername(req);
    if (!username) return res.status(401).send("Nicht eingeloggt");

    const key = `inbox:${username}`;
    const raw = await kv.lrange(key, 0, 200); // neueste oben (lpush)

    const messages = [];
    for (const item of raw || []) {
      if (typeof item !== "string") continue;
      try {
        const parsed = JSON.parse(item);
        if (parsed && typeof parsed.text === "string") messages.push(parsed);
      } catch {}
    }

    return res.status(200).json({ ok: true, messages });
  } catch (err) {
    console.error("INBOX ERROR:", err);
    return res.status(500).send("Serverfehler: " + (err?.message || String(err)));
  }
}