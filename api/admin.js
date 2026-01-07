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
const normalizeEmail = e => String(e || "").trim().toLowerCase();
const isValidUsername = u => /^[a-z0-9_-]{3,20}$/.test(u);
const isValidEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function parseEuro(x) {
  const s = String(x || "").trim().replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function parseEmailItem(item) {
  if (typeof item === "string") {
    try {
      const p = JSON.parse(item);
      if (p && typeof p.email === "string" && isValidEmail(p.email)) {
        return { email: normalizeEmail(p.email), ts: p.ts ?? null };
      }
    } catch {}
  }
  return null;
}

/* ================= Handler ================= */

export default async function handler(req, res) {
  // ❗ wichtig auf Vercel (sonst alte Responses)
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).send("Forbidden");

  try {
    const url = new URL(req.url, "http://localhost");
    const action = (url.searchParams.get("action") || "").trim();

    /* ---------- USERS ---------- */
    if (req.method === "GET" && action === "users") {
      const users = await kv.smembers("users");
      return res.status(200).json({
        ok: true,
        users: (users || []).map(u => String(u).toLowerCase()).sort()
      });
    }

    /* ---------- EMAILS OF USER ---------- */
    if (req.method === "GET" && action === "emails") {
      const username = normalizeUsername(url.searchParams.get("username"));
      if (!username) return res.status(400).send("username fehlt");

      const raw = await kv.lrange(`emails:${username}`, 0, -1);
      const emails = [];

      for (const item of raw || []) {
        const parsed = parseEmailItem(item);
        if (parsed) emails.push(parsed);
      }

      emails.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
      return res.status(200).json({ ok: true, emails });
    }

    /* ---------- DELETE ONE EMAIL ---------- */
    if (req.method === "DELETE" && action === "emails") {
      const body = await readJson(req);
      const username = normalizeUsername(body.username);
      const email = normalizeEmail(body.email);

      if (!username) return res.status(400).send("username fehlt");
      if (!email || !isValidEmail(email)) return res.status(400).send("email ungültig");

      const listKey = `emails:${username}`;
      const setKey = `emailset:${username}`;

      const raw = await kv.lrange(listKey, 0, -1);
      let removed = 0;

      for (const item of raw || []) {
        const parsed = parseEmailItem(item);
        if (parsed && parsed.email === email) {
          await kv.lrem(listKey, 0, item);
          removed++;
        }
      }

      await kv.srem(setKey, email);
      return res.status(200).json({ ok: true, removed });
    }

    /* ---------- CLEAR ALL EMAILS ---------- */
    if (req.method === "DELETE" && action === "clear-emails") {
      const body = await readJson(req);
      const username = normalizeUsername(body.username);
      if (!username) return res.status(400).send("username fehlt");

      const count = await kv.llen(`emails:${username}`).catch(() => 0);
      await kv.del(`emails:${username}`);
      await kv.del(`emailset:${username}`);

      return res.status(200).json({ ok: true, deletedEmails: count });
    }

    /* ---------- ALL EMAILS ---------- */
    if (req.method === "GET" && action === "all-emails") {
      const users = await kv.smembers("users");
      const all = [];

      for (const u of users || []) {
        const username = normalizeUsername(u);
        const raw = await kv.lrange(`emails:${username}`, 0, -1);
        for (const item of raw || []) {
          const parsed = parseEmailItem(item);
          if (parsed) all.push({ username, ...parsed });
        }
      }

      all.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
      return res.status(200).json({ ok: true, emails: all });
    }

    /* ---------- ADMIN INBOX DEBUG ---------- */
    if (req.method === "GET" && action === "inbox") {
      const username = normalizeUsername(url.searchParams.get("username"));
      if (!username) return res.status(400).send("username fehlt");

      const key = `inbox:${username}`;
      const raw = await kv.lrange(key, 0, 200);
      const messages = [];

      for (const item of raw || []) {
        try {
          const p = JSON.parse(item);
          if (p && p.text) messages.push(p);
        } catch {}
      }

      return res.status(200).json({
        ok: true,
        username,
        key,
        count: messages.length,
        messages
      });
    }

    /* ---------- NOTIFY (POST) ---------- */
    if (req.method === "POST" && action === "notify") {
      const body = await readJson(req);
      const username = normalizeUsername(body.username);
      const euro = parseEuro(body.euro);

      if (!username) return res.status(400).send("username fehlt");
      if (euro === null) return res.status(400).send("Betrag ungültig");

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

      await kv.lpush(key, JSON.stringify(msg));
      const len = await kv.llen(key).catch(() => null);

      return res.status(200).json({ ok: true, debug: { username, inboxLen: len } });
    }

    /* ---------- NOTIFY TEST (GET) ---------- */
    if (req.method === "GET" && action === "notify-test") {
      const username = normalizeUsername(url.searchParams.get("username"));
      const euro = parseEuro(url.searchParams.get("euro"));

      if (!username) return res.status(400).send("username fehlt");
      if (euro === null) return res.status(400).send("euro fehlt");

      const key = `inbox:${username}`;
      await kv.lpush(key, JSON.stringify({
        type: "payout",
        euro,
        text: `Du bekommst für eine deiner Emails ${euro} Euro. Herzlichen Glückwunsch.`,
        ts: Date.now(),
        from: "admin"
      }));

      const len = await kv.llen(key).catch(() => null);
      return res.status(200).json({ ok: true, debug: { username, inboxLen: len } });
    }

    /* ---------- DELETE USER ---------- */
    if (req.method === "DELETE" && action === "user") {
      const body = await readJson(req);
      const username = normalizeUsername(body.username);

      if (!username) return res.status(400).send("username fehlt");
      if (username === "gzuz") return res.status(403).send("Admin kann nicht gelöscht werden");

      await kv.del(`user:${username}`);
      await kv.del(`emails:${username}`);
      await kv.del(`emailset:${username}`);
      await kv.del(`inbox:${username}`);
      await kv.srem("users", username);

      return res.status(200).json({ ok: true });
    }

    /* ---------- RENAME USER ---------- */
    if (req.method === "PATCH" && action === "user") {
      const body = await readJson(req);
      const oldU = normalizeUsername(body.oldUsername);
      const newU = normalizeUsername(body.newUsername);

      if (!oldU || !newU) return res.status(400).send("user fehlt");
      if (!isValidUsername(newU)) return res.status(400).send("neuer Username ungültig");

      const user = await kv.get(`user:${oldU}`);
      if (!user) return res.status(404).send("User nicht gefunden");
      if (await kv.get(`user:${newU}`)) return res.status(409).send("Username vergeben");

      await kv.set(`user:${newU}`, { ...user, username: newU });
      await kv.del(`user:${oldU}`);

      await kv.rename(`emails:${oldU}`, `emails:${newU}`);
      await kv.rename(`emailset:${oldU}`, `emailset:${newU}`);
      await kv.rename(`inbox:${oldU}`, `inbox:${newU}`);

      await kv.srem("users", oldU);
      await kv.sadd("users", newU);

      return res.status(200).json({ ok: true });
    }

    return res.status(400).send("Unknown action");
  } catch (err) {
    console.error("ADMIN ERROR:", err);
    return res.status(500).send("Serverfehler: " + (err?.message || String(err)));
  }
}