import { kv } from "@vercel/kv";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

function setAuthCookie(res, token) {
  // Vercel läuft über HTTPS -> Secure ist ok
  res.setHeader("Set-Cookie", [
    `token=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 7}`
  ]);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const { username, password } = req.body || {};
  const u = String(username || "").trim().toLowerCase();
  const p = String(password || "");

  if (!u || !p) {
    return res.status(400).send("Bitte alle Felder ausfüllen.");
  }

  try {
    const user = await kv.get(`user:${u}`);

    // User nicht gefunden oder Daten kaputt
    if (!user || !user.hash) {
      return res.status(401).send("Benutzername oder Passwort falsch.");
    }

    const ok = await bcrypt.compare(p, user.hash);
    if (!ok) {
      return res.status(401).send("Benutzername oder Passwort falsch.");
    }

    const secretValue = process.env.JWT_SECRET;
    if (!secretValue) {
      return res.status(500).send("Server ist nicht konfiguriert (JWT_SECRET fehlt).");
    }

    const secret = new TextEncoder().encode(secretValue);

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