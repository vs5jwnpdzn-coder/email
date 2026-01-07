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

function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}

function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function toEntry(item) {
  // Objekt
  if (item && typeof item === "object") {
    const email = normalizeEmail(item.email);
    if (typeof item.email === "string" && isValidEmail(email)) {
      const ts = (typeof item.ts === "number") ? item.ts : null;
      return { email, ts };
    }
    return null;
  }

  // String
  if (typeof item === "string") {
    // JSON-String?
    try {
      const parsed = JSON.parse(item);
      if (parsed && typeof parsed.email === "string") {
        const email = normalizeEmail(parsed.email);
        if (!isValidEmail(email)) return null;
        const ts = (typeof parsed.ts === "number") ? parsed.ts : null;
        return { email, ts };
      }
    } catch {}

    // Plain String (alt)
    const email = normalizeEmail(item);
    if (isValidEmail(email)) return { email, ts: null };
  }

  return null;
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).send("Forbidden");

  try {
    // ---------- GET: Emails eines Users ----------
    if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const username = normalizeUsername(url.searchParams.get("username"));

      if (!username) return res.status(400).send("username fehlt");

      const key = `emails:${username}`;
      const raw = await kv.lrange(key, 0, 499);

      const emails = [];
      for (const item of raw || []) {
        const entry = toEntry(item);
        if (entry) emails.push(entry);
      }

      // Neueste oben (ts null hinten)
      emails.sort((a, b) => (b.ts ?? -1) - (a.ts ?? -1));

      return res.status(200).json({ ok: true, username, emails });
    }

    // ---------- DELETE: Email eines Users löschen ----------
    if (req.method === "DELETE") {
      const body = await readJson(req);
      const username = normalizeUsername(body.username);
      const emailToDelete = normalizeEmail(body.email);

      if (!username) return res.status(400).send("username fehlt");
      if (!emailToDelete || !isValidEmail(emailToDelete)) return res.status(400).send("email fehlt/ungültig");

      const key = `emails:${username}`;
      const raw = await kv.lrange(key, 0, -1);

      // Filtere alles raus, was dieselbe Email ist (egal ob JSON oder plain)
      const kept = [];
      let removed = 0;

      for (const item of raw || []) {
        const entry = toEntry(item);
        if (entry && entry.email === emailToDelete) {
          removed++;
          continue;
        }
        kept.push(item);
      }

      if (removed === 0) {
        return res.status(404).send("Email nicht gefunden.");
      }

      // Liste neu aufbauen (Order bleibt wie kv.lrange liefert: head -> tail)
      await kv.del(key);
      if (kept.length > 0) {
        // rpush in gleicher Reihenfolge reproduziert dieselbe Reihenfolge
        await kv.rpush(key, ...kept);
      }

      return res.status(200).json({ ok: true, username, removed });
    }

    return res.status(405).send("Method not allowed");
  } catch (err) {
    console.error("ADMIN EMAILS ERROR:", err);
    return res.status(500).send("Serverfehler");
  }
}