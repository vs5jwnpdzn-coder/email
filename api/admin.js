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
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}

function isValidUsername(u) {
  return /^[a-z0-9_-]{3,20}$/.test(u);
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
    // try JSON
    try {
      const p = JSON.parse(item);
      if (p && typeof p.email === "string") {
        const email = normalizeEmail(p.email);
        if (!isValidEmail(email)) return null;
        const ts = (typeof p.ts === "number") ? p.ts : null;
        return { email, ts };
      }
    } catch {}

    // plain
    const email = normalizeEmail(item);
    if (isValidEmail(email)) return { email, ts: null };
  }

  return null;
}

export default async function handler(req, res) {
  // ✅ WICHTIG: nie cachen (sonst “kommt nix an”, obwohl KV schon geschrieben hat)
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
    // GET emails for user
    // --------------------
    if (req.method === "GET" && action === "emails") {
      const username = normalizeUsername(url.searchParams.get("username"));
      if (!username) return res.status(400).send("username fehlt");

      const raw = await kv.lrange(`emails:${username}`, 0, -1);

      const emails = [];
      for (const item of raw || []) {
        const parsed = parseEmailItem(item);
        if (parsed) emails.push(parsed);
      }

      emails.sort((a, b) => (b.ts ?? -1) - (a.ts ?? -1));
      return res.status(200).json({ ok: true, emails });
    }

    // --------------------
    // DELETE one email for user
    // Body: { username, email }
    // --------------------
    if (req.method === "DELETE" && action === "emails") {
      const body = await readJson(req);
      const username = normalizeUsername(body.username);
      const email = normalizeEmail(body.email);

      if (!username) return res.status(400).send("username fehlt");
      if (!email || !isValidEmail(email)) return res.status(400).send("email fehlt/ungültig");

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

    // --------------------
    // DELETE clear all emails (keep account)
    // Body: { username }
    // --------------------
    if (req.method === "DELETE" && action === "clear-emails") {
      const body = await readJson(req);
      const username = normalizeUsername(body.username);
      if (!username) return res.status(400).send("username fehlt");

      const listKey = `emails:${username}`;
      const setKey = `emailset:${username}`;

      let before = 0;
      try { before = await kv.llen(listKey); } catch { before = 0; }

      await kv.del(listKey);
      await kv.del(setKey);

      return res.status(200).json({ ok: true, username, deletedEmails: before });
    }

    // --------------------
    // GET all-emails
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
        for (const item of raw || []) {
          const parsed = parseEmailItem(item);
          if (!parsed) continue;
          all.push({ username, email: parsed.email, ts: parsed.ts });
        }
      }

      all.sort((a, b) => (b.ts ?? -1) - (a.ts ?? -1));

      return res.status(200).json({
        ok: true,
        total: all.length,
        emails: all.slice(0, limit)
      });
    }

    // --------------------
    // ✅ GET inbox of a user (ADMIN DEBUG)
    // /api/admin?action=inbox&username=bonez
    // --------------------
    if (req.method === "GET" && action === "inbox") {
      const username = normalizeUsername(url.searchParams.get("username"));
      if (!username) return res.status(400).send("username fehlt");

      const key = `inbox:${username}`;
      const raw = await kv.lrange(key, 0, 200);

      const messages = [];
      for (const item of raw || []) {
        if (typeof item !== "string") continue;
        try {
          const parsed = JSON.parse(item);
          if (parsed && typeof parsed.text === "string") messages.push(parsed);
        } catch {}
      }

      return res.status(200).json({ ok: true, username, key, count: messages.length, messages });
    }

    // --------------------
    // POST notify (payout msg) -> inbox:<username>
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
      const key = `inbox:${username}`;

      await kv.lpush(key, JSON.stringify(msg));

      // ✅ Debug: sofort prüfen ob es wirklich drin liegt
      const len = await kv.llen(key).catch(() => null);

      return res.status(200).json({ ok: true, debug: { username, key, inboxLen: len } });
    }

    // --------------------
    // DELETE user (remove account + emails + sets + inbox + users set)
    // Body: { username }
    // --------------------
    if (req.method === "DELETE" && action === "user") {
      const body = await readJson(req);
      const username = normalizeUsername(body.username);

      if (!username) return res.status(400).send("username fehlt");
      if (username === "gzuz") return res.status(403).send("Admin-User kann nicht gelöscht werden.");

      const userKey = `user:${username}`;
      const listKey = `emails:${username}`;
      const setKey = `emailset:${username}`;
      const inboxKey = `inbox:${username}`;

      const exists = await kv.get(userKey);
      if (!exists) return res.status(404).send("User nicht gefunden.");

      let emailCount = 0;
      try { emailCount = await kv.llen(listKey); } catch { emailCount = 0; }

      await kv.del(userKey);
      await kv.del(listKey);
      await kv.del(setKey);
      await kv.del(inboxKey);
      await kv.srem("users", username);

      return res.status(200).json({ ok: true, username, deletedEmails: emailCount });
    }

    // --------------------
    // PATCH user rename
    // Body: { oldUsername, newUsername }
    // --------------------
    if (req.method === "PATCH" && action === "user") {
      const body = await readJson(req);
      const oldUsername = normalizeUsername(body.oldUsername);
      const newUsername = normalizeUsername(body.newUsername);

      if (!oldUsername || !newUsername) return res.status(400).send("oldUsername/newUsername fehlt");
      if (oldUsername === "gzuz") return res.status(403).send("Admin-User kann nicht umbenannt werden.");
      if (oldUsername === newUsername) return res.status(400).send("Username ist identisch.");
      if (!isValidUsername(newUsername)) return res.status(400).send("Neuer Username ungültig (3–20 Zeichen, a-z 0-9 _ -).");

      const oldUserKey = `user:${oldUsername}`;
      const newUserKey = `user:${newUsername}`;

      const oldUser = await kv.get(oldUserKey);
      if (!oldUser) return res.status(404).send("Alter User nicht gefunden.");

      const newExists = await kv.get(newUserKey);
      if (newExists) return res.status(409).send("Neuer Username ist bereits vergeben.");

      // move user obj
      await kv.set(newUserKey, { ...(oldUser || {}), username: newUsername });

      // move emails list
      const oldEmailsKey = `emails:${oldUsername}`;
      const newEmailsKey = `emails:${newUsername}`;
      const rawEmails = await kv.lrange(oldEmailsKey, 0, -1);
      const movedEmails = (rawEmails || []).length;

      await kv.del(newEmailsKey);
      if (rawEmails && rawEmails.length) await kv.rpush(newEmailsKey, ...rawEmails);

      // move emailset
      const oldSetKey = `emailset:${oldUsername}`;
      const newSetKey = `emailset:${newUsername}`;
      const setMembers = await kv.smembers(oldSetKey);

      await kv.del(newSetKey);
      if (setMembers && setMembers.length) await kv.sadd(newSetKey, ...setMembers);

      // move inbox
      const oldInboxKey = `inbox:${oldUsername}`;
      const newInboxKey = `inbox:${newUsername}`;
      const rawInbox = await kv.lrange(oldInboxKey, 0, -1);
      await kv.del(newInboxKey);
      if (rawInbox && rawInbox.length) await kv.rpush(newInboxKey, ...rawInbox);

      // delete old keys
      await kv.del(oldUserKey);
      await kv.del(oldEmailsKey);
      await kv.del(oldSetKey);
      await kv.del(oldInboxKey);

      // update users set
      await kv.srem("users", oldUsername);
      await kv.sadd("users", newUsername);

      return res.status(200).json({ ok: true, oldUsername, newUsername, movedEmails });
    }

    return res.status(400).send("Unknown action");
  } catch (err) {
    console.error("ADMIN ERROR:", err);
    return res.status(500).send("Serverfehler: " + (err?.message || String(err)));
  }
}