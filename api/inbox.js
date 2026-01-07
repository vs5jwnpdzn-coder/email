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

  return String(payload.username || "").trim().toLowerCase();
}

function toMsg(item) {
  // KV kann String ODER Objekt liefern
  if (item && typeof item === "object") return item;
  if (typeof item === "string") {
    try { return JSON.parse(item); } catch { return null; }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

  try {
    const username = await getUsername(req);
    if (!username) return res.status(401).send("Nicht eingeloggt");

    const key = `inbox:${username}`;

    // ✅ GET: Inbox holen + unreadCount
    if (req.method === "GET") {
      const raw = await kv.lrange(key, 0, 200);

      const messages = [];
      let unreadCount = 0;

      for (const item of raw || []) {
        const msg = toMsg(item);
        if (!msg || typeof msg.text !== "string") continue;

        if (msg.read !== true) unreadCount++;
        messages.push(msg);
      }

      return res.status(200).json({
        ok: true,
        unreadCount,
        hasUnread: unreadCount > 0,
        messages
      });
    }

    // ✅ POST: alles als gelesen markieren
    if (req.method === "POST") {
      const rawAll = await kv.lrange(key, 0, -1);

      const updated = [];
      for (const item of rawAll || []) {
        const msg = toMsg(item);
        if (!msg || typeof msg.text !== "string") continue;

        msg.read = true;
        updated.push(JSON.stringify(msg));
      }

      // Liste ersetzen (Reihenfolge bleibt: neueste oben)
      await kv.del(key);
      if (updated.length) await kv.rpush(key, ...updated);

      return res.status(200).json({ ok: true, marked: updated.length, unreadCount: 0 });
    }

    return res.status(405).send("Method not allowed");
  } catch (err) {
    console.error("INBOX ERROR:", err);
    return res.status(500).send("Serverfehler: " + (err?.message || String(err)));
  }
}