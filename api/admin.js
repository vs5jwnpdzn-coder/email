export const config = { runtime: "nodejs" };

import { kv } from "@vercel/kv";
import { jwtVerify } from "jose";

/* ================= Helpers ================= */

function getCookie(req, name) {
  const cookie = req.headers.cookie || "";
  const parts = cookie.split(";").map(p => p.trim());
  const found = parts.find(p => p.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : "";
}

async function requireAdmin(req) {
  const token = getCookie(req, "token");
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    if (payload.role !== "admin") return null;
    return payload;
  } catch {
    return null;
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

const normalizeUsername = u => String(u || "").trim().toLowerCase();

function parseEuro(x) {
  const s = String(x || "").trim().replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/* ================= Handler ================= */

export default async function handler(req, res) {
  // ❗ ABSOLUT WICHTIG (sonst alte Responses von Vercel)
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).send("Forbidden");

  try {
    const url = new URL(req.url, "http://localhost");
    const action = (url.searchParams.get("action") || "").trim();

    /* =====================================================
       USERS
    ===================================================== */
    if (req.method === "GET" && action === "users") {
      const users = await kv.smembers("users");
      return res.status(200).json({
        ok: true,
        users: (users || []).map(u => String(u).toLowerCase()).sort()
      });
    }

    /* =====================================================
       🔎 INBOX DEBUG (LESEN – RAW + PARSED)
       /api/admin?action=inbox&username=bonez
    ===================================================== */
    if (req.method === "GET" && action === "inbox") {
      const username = normalizeUsername(url.searchParams.get("username"));
      if (!username) return res.status(400).send("username fehlt");

      const key = `inbox:${username}`;
      const raw = await kv.lrange(key, 0, 200);

      let parsedCount = 0;
      const messages = [];

      for (const item of raw || []) {
        if (typeof item !== "string") continue;
        try {
          const p = JSON.parse(item);
          if (p && typeof p.text === "string") {
            parsedCount++;
            messages.push(p);
          }
        } catch {}
      }

      return res.status(200).json({
        ok: true,
        username,
        key,
        rawCount: (raw || []).length,
        parsedCount,
        sample0: raw && raw[0] ? raw[0] : null,
        messages
      });
    }

    /* =====================================================
       ✉️ NOTIFY TEST (SCHREIBEN + SOFORT LESEN)
       /api/admin?action=notify-test&username=bonez&euro=12
    ===================================================== */
    if (req.method === "GET" && action === "notify-test") {
      const username = normalizeUsername(url.searchParams.get("username"));
      const euro = parseEuro(url.searchParams.get("euro"));

      if (!username) return res.status(400).send("username fehlt");
      if (euro === null) return res.status(400).send("euro fehlt/ungültig");

      const user = await kv.get(`user:${username}`);
      if (!user) return res.status(404).send("User nicht gefunden");

      const key = `inbox:${username}`;
      const msg = {
        type: "payout",
        euro,
        text: `Du bekommst für eine deiner Emails ${euro} Euro. Herzlichen Glückwunsch.`,
        ts: Date.now(),
        from: "admin"
      };

      // 🔴 SCHREIBEN
      await kv.lpush(key, JSON.stringify(msg));

      // 🔎 SOFORT LESEN
      const raw = await kv.lrange(key, 0, 5);
      const len = await kv.llen(key).catch(() => null);

      return res.status(200).json({
        ok: true,
        debug: {
          username,
          key,
          inboxLen: len,
          rawCount: (raw || []).length,
          sample0: raw && raw[0] ? raw[0] : null
        }
      });
    }

    return res.status(400).send("Unknown action");
  } catch (err) {
    console.error("ADMIN ERROR:", err);
    return res.status(500).send("Serverfehler: " + (err?.message || String(err)));
  }
}