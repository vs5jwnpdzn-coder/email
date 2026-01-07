export const config = { runtime: "nodejs" };

import { kv } from "@vercel/kv";
import { jwtVerify } from "jose";

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
    const secretValue = process.env.JWT_SECRET;
    if (!secretValue) return null;

    const secret = new TextEncoder().encode(secretValue);
    const { payload } = await jwtVerify(token, secret);
    if (payload?.role !== "admin") return null;
    return payload;
  } catch {
    return null;
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}

function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function parseEuro(x) {
  const s = String(x || "").trim().replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function parseEmailItem(item) {
  // supports stringified JSON OR plain string OR object
  if (item && typeof item === "object") {
    const email = normalizeEmail(item.email);
    if (typeof item.email === "string" && isValidEmail(email)) {
      const ts = (typeof item.ts === "number") ? item.ts : null;
      return { email, ts };
    }
    return null;
  }

  if (typeof item === "string") {
    try {
      const p = JSON.parse(item);
      if (p && typeof p.email === "string") {
        const email = normalizeEmail(p.email);
        if (!isValidEmail(email)) return null;
        const ts = (typeof p.ts === "number") ? p.ts : null;
        return { email, ts };
      }
    } catch {}

    const email = normalizeEmail(item);
    if (isValidEmail(email)) return { email, ts: null };
  }

  return null;
}

export default async function handler(req, res) {
  // ✅ wichtig auf Vercel
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).send("Forbidden");

  try {
    const url = new URL(req.url, "http://localhost");
    const action = (url.searchParams.get("action") || "").trim();

    // --------------------
    // GET users
    // --------------------
    if (req.method === "GET" && action === "users") {
      const users = await kv.smembers("users");
      const list = (users || [])
        .filter(u => typeof u === "string" && u.trim())
        .map(u => u.trim().toLowerCase())
        .sort();

      return res.status(200).json({ ok: true, users: list });
    }

    // --------------------
    // GET emails for user (+ used)
    // --------------------
    if (req.method === "GET" && action === "emails") {
      const username = normalizeUsername(url.searchParams.get("username"));
      if (!username) return res.status(400).send("username fehlt");

      const raw = await kv.lrange(`emails:${username}`, 0, -1);
      const usedSet = new Set((await kv.smembers(`usedset:${username}`)) || []);

      const emails = [];
      for (const item of raw || []) {
        const parsed = parseEmailItem(item);
        if (!parsed) continue;
        emails.push({ ...parsed, used: usedSet.has(parsed.email) });
      }

      emails.sort((a, b) => (b.ts ?? -1) - (a.ts ?? -1));
      return res.status(200).json({ ok: true, emails });
    }

    // --------------------
    // ✅ PATCH email used/un-used
    // Body: { username, email, used: true|false }
    // --------------------
    if (req.method === "PATCH" && action === "email-used") {
      const body = await readJson(req);
      const username = normalizeUsername(body.username);
      const email = normalizeEmail(body.email);
      const used = !!body.used;

      if (!username) return res.status(400).send("username fehlt");
      if (!email || !isValidEmail(email)) return res.status(400).send("email fehlt/ungültig");

      const key = `usedset:${username}`;
      if (used) await kv.sadd(key, email);
      else await kv.srem(key, email);

      return res.status(200).json({ ok: true, username, email, used });
    }

    // --------------------
    // ✅ DELETE one email for user
    // Body: { username, email }
    // --------------------
    if (req.method === "DELETE" && action === "emails") {
      const body = await readJson(req);
      const username = normalizeUsername(body.username);
      const email = normalizeEmail(body.email);

      if (!username) return res.status(400).send("username fehlt");
      if (!email || !isValidEmail(email)) return res.status(400).send("email fehlt/ungültig");

      const listKey = `emails:${username}`;
      const setKey  = `emailset:${username}`;
      const usedKey = `usedset:${username}`;

      const raw = await kv.lrange(listKey, 0, -1);

      let removed = 0;
      for (const item of raw || []) {
        const parsed = parseEmailItem(item);
        if (parsed && parsed.email === email) {
          await kv.lrem(listKey, 0, item); // entfernt alle exakt gleichen List-Werte
          removed++;
        }
      }

      await kv.srem(setKey, email);
      await kv.srem(usedKey, email); // ✅ Haken auch entfernen

      return res.status(200).json({ ok: true, removed });
    }

    // --------------------
    // DELETE clear all emails (keep account)
    // Body: { username }
    // --------------------
    if (req.method === "DELETE" && action === "clear-emails") {
      const body = await readJson(req);
      const username = normalizeUsername(body.username);
      if (!username) return res.status(400).send("username fehlt");

      const listKey = `emails:${username}`;
      const setKey  = `emailset:${username}`;
      const usedKey = `usedset:${username}`;

      let before = 0;
      try { before = await kv.llen(listKey); } catch { before = 0; }

      await kv.del(listKey);
      await kv.del(setKey);
      await kv.del(usedKey);

      return res.status(200).json({ ok: true, username, deletedEmails: before });
    }

    // --------------------
    // GET all-emails (+ used)
    // --------------------
    if (req.method === "GET" && action === "all-emails") {
      const limit = Math.max(1, Math.min(5000, parseInt(url.searchParams.get("limit") || "1000", 10)));

      const users = await kv.smembers("users");
      const usernames = (users || [])
        .filter(u => typeof u === "string" && u.trim())
        .map(u => u.trim().toLowerCase());

      const all = [];

      for (const username of usernames) {
        const raw = await kv.lrange(`emails:${username}`, 0, -1);
        const usedSet = new Set((await kv.smembers(`usedset:${username}`)) || []);

        for (const item of raw || []) {
          const parsed = parseEmailItem(item);
          if (!parsed) continue;
          all.push({
            username,
            email: parsed.email,
            ts: parsed.ts,
            used: usedSet.has(parsed.email)
          });
        }
      }

      all.sort((a, b) => (b.ts ?? -1) - (a.ts ?? -1));

      return res.status(200).json({
        ok: true,
        total: all.length,
        usersCount: usernames.length,
        emails: all.slice(0, limit)
      });
    }

    // --------------------
    // POST notify -> inbox:<username>
    // Body: { username, euro }
    // --------------------
    if (req.method === "POST" && action === "notify") {
      const body = await readJson(req);
      const username = normalizeUsername(body.username);
      const euro = parseEuro(body.euro);

      if (!username) return res.status(400).send("username fehlt");
      if (euro === null) return res.status(400).send("Bitte gültigen Euro-Betrag eingeben.");

      const user = await kv.get(`user:${username}`);
      if (!user) return res.status(404).send("User nicht gefunden.");

      const text = `Du bekommst für eine deiner Emails ${euro} Euro. Herzlichen Glückwunsch.`;
      const msg = { type: "payout", euro, text, ts: Date.now(), from: "admin" };

      await kv.lpush(`inbox:${username}`, JSON.stringify(msg));
      return res.status(200).json({ ok: true });
    }

    return res.status(400).send("Unknown action");
  } catch (err) {
    console.error("ADMIN ERROR:", err);
    return res.status(500).send("Serverfehler: " + (err?.message || String(err)));
  }
}