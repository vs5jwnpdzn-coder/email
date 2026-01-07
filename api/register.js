export const config = { runtime: "nodejs" };

import { kv } from "@vercel/kv";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

function setAuthCookie(res, token) {
  // Wichtig für Vercel/Preview/cross-site: SameSite=None + Secure
  res.setHeader("Set-Cookie", [
    `token=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${60 * 60 * 24 * 7}`
  ]);
}

async function readJson(req) {
  // Falls Vercel schon geparst hat
  if (req.body && typeof req.body === "object") return req.body;

  // Robust: raw body lesen
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
  // Muss zur UI passen:
  // 3–20 Zeichen, nur a-z 0-9 _ -
  return /^[a-z0-9_-]{3,20}$/.test(u);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const body = await readJson(req);

    const { username, password, confirm } = body || {};
    const u = normalizeUsername(username);
    const p = String(password || "");
    const c = String(confirm || "");

    if (!u || !p || !c) return res.status(400).send("Bitte alle Felder ausfüllen.");
    if (!isValidUsername(u)) return res.status(400).send("Benutzername ungültig (3–20 Zeichen, a-z 0-9 _ -).");
    if (p !== c) return res.status(400).send("Passwörter stimmen nicht überein.");
    if (p.length < 8) return res.status(400).send("Passwort muss mind. 8 Zeichen haben.");

    if (!process.env.JWT_SECRET) {
      return res.status(500).send("JWT_SECRET fehlt in Vercel Env Vars.");
    }

    const key = `user:${u}`;

    // ✅ Server-seitig finaler Schutz
    const exists = await kv.get(key);
    if (exists) return res.status(409).send("Benutzername ist bereits vergeben.");

    const hash = await bcrypt.hash(p, 12);
    await kv.set(key, { username: u, hash });

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const token = await new SignJWT({ username: u })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    setAuthCookie(res, token);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).send("Serverfehler");
  }
}