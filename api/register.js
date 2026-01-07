export const config = { runtime: "nodejs" };

import { kv } from "@vercel/kv";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

function setAuthCookie(res, token) {
  res.setHeader("Set-Cookie", [
    `token=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 7}`
  ]);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const body = await readJson(req);

    const { username, password, confirm } = body || {};
    const u = String(username || "").trim().toLowerCase();
    const p = String(password || "");
    const c = String(confirm || "");

    if (!u || !p || !c) return res.status(400).send("Bitte alle Felder ausfüllen.");
    if (p !== c) return res.status(400).send("Passwörter stimmen nicht überein.");
    if (u.length < 3) return res.status(400).send("Benutzername muss mind. 3 Zeichen haben.");
    if (/\s/.test(u)) return res.status(400).send("Benutzername darf keine Leerzeichen enthalten.");
    if (p.length < 8) return res.status(400).send("Passwort muss mind. 8 Zeichen haben.");

    if (!process.env.JWT_SECRET) {
      return res.status(500).send("JWT_SECRET fehlt in Vercel Env Vars.");
    }

    const key = `user:${u}`;
    const exists = await kv.get(key);
    if (exists) return res.status(409).send("Benutzername ist bereits vergeben.");

    const hash = await bcrypt.hash(p, 12);
    await kv.set(key, { username: u, hash });

    // ✅ WICHTIG: User in globale Liste aufnehmen (damit Admin alle Emails finden kann)
    await kv.sadd("users", u);

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
    return res.status(500).send("Serverfehler: " + (err?.message || String(err)));
  }
}