export const config = { runtime: "nodejs" };

import { kv } from "@vercel/kv";
import { jwtVerify } from "jose";

function getCookie(req, name) {
  const cookie = req.headers.cookie || "";
  const parts = cookie.split(";").map(p => p.trim());
  const found = parts.find(p => p.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : "";
}

async function getUsernameFromToken(req) {
  const token = getCookie(req, "token");
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return String(payload.username);
  } catch {
    return null;
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(s) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(s);
}

function toEntry(item) {
  // 1) Objekt
  if (item && typeof item === "object") {
    const email = normalizeEmail(item.email);
    if (typeof item.email === "string" && isValidEmail(email)) {
      const ts = (typeof item.ts === "number") ? item.ts : null;
      return { email, ts };
    }
    return null;
  }

  // 2) String
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
    } catch {
      // kein JSON
    }

    // Plain email string (altes Format)
    const email = normalizeEmail(item);
    if (isValidEmail(email)) return { email, ts: null };
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  try {
    const username = await getUsernameFromToken(req);
    if (!username) return res.status(401).send("Nicht eingeloggt.");

    const key = `emails:${username}`;
    const raw = await kv.lrange(key, 0, 199); // letzte 200

    const emails = [];
    for (const item of raw || []) {
      const entry = toEntry(item);
      if (entry) emails.push(entry);
    }

    // ✅ Neueste oben: sortiere nach ts desc (null bleibt hinten, relative Reihenfolge egal)
    emails.sort((a, b) => (b.ts ?? -1) - (a.ts ?? -1));

    return res.status(200).json({ ok: true, emails });
  } catch (err) {
    console.error("EMAILS ERROR:", err);
    return res.status(500).send("Serverfehler");
  }
}