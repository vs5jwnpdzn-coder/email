import { kv } from "@vercel/kv";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

function setAuthCookie(res, token) {
  res.setHeader("Set-Cookie", [
    `token=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 7}`
  ]);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const { username, password, confirm } = req.body || {};
  const u = String(username || "").trim().toLowerCase();
  const p = String(password || "");
  const c = String(confirm || "");

  // Basic Validierung
  if (!u || !p || !c) return res.status(400).send("Bitte alle Felder ausfüllen.");
  if (p !== c) return res.status(400).send("Passwörter stimmen nicht überein.");
  if (u.length < 3) return res.status(400).send("Benutzername muss mind. 3 Zeichen haben.");
  if (/\s/.test(u)) return res.status(400).send("Benutzername darf keine Leerzeichen enthalten.");
  if (p.length < 8) return res.status(400).send("Passwort muss mind. 8 Zeichen haben.");

  try {
    const key = `user:${u}`;

    // Username schon vergeben?
    const exists = await kv.get(key);
    if (exists) return res.status(409).send("Benutzername ist bereits vergeben.");

    // Passwort hashen + speichern
    const hash = await bcrypt.hash(p, 12);
    await kv.set(key, { username: u, hash });

    const secretValue = process.env.JWT_SECRET;
    if (!secretValue) {
      return res.status(500).send("Server ist nicht konfiguriert (JWT_SECRET fehlt).");
    }
    const secret = new TextEncoder().encode(secretValue);

    // Direkt einloggen (Cookie setzen)
    const token = await new SignJWT({ username: u })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    setAuthCookie(res, token);
    return res.status(200).json({ ok: true });

  } catch (err) {
    return res.status(500).send("Serverfehler.");
  }
}