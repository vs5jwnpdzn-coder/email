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

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return String(payload.username);
  } catch {
    return null;
  }
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null;

  try { return JSON.parse(raw); } catch { return null; }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(s) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(s);
}

function extractEmail(item) {
  // akzeptiere alte + neue Formate
  if (item && typeof item === "object" && typeof item.email === "string") {
    return normalizeEmail(item.email);
  }
  if (typeof item === "string") {
    // JSON-String?
    try {
      const parsed = JSON.parse(item);
      if (parsed && typeof parsed.email === "string") return normalizeEmail(parsed.email);
    } catch {}
    // Plain-String
    return normalizeEmail(item);
  }
  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const username = await getUsername(req);
    if (!username) return res.status(401).send("Nicht eingeloggt");

    const body = await readJsonBody(req);
    if (!body || typeof body.email !== "string") {
      return res.status(400).send("Email fehlt");
    }

    const emailNorm = normalizeEmail(body.email);
    if (!emailNorm) return res.status(400).send("Email fehlt");
    if (!isValidEmail(emailNorm)) return res.status(400).send("Ungültige Email");

    const key = `emails:${username}`;

    // ✅ Duplikat-Check (prüfe z.B. die letzten 500 Einträge)
    const raw = await kv.lrange(key, 0, 499);

    const exists = (raw || []).some(item => extractEmail(item) === emailNorm);
    if (exists) {
      // 409 Conflict → Frontend zeigt Text an
      return res.status(409).send("Diese Email wurde bereits gespeichert.");
    }

    // ✅ Speichern (neueste oben durch LPUSH)
    await kv.lpush(key, JSON.stringify({ email: emailNorm, ts: Date.now() }));

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("SEND ERROR:", err);
    return res.status(500).send("Serverfehler");
  }
}