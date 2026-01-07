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

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  return String(payload.username);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const username = await getUsernameFromToken(req);
    if (!username) return res.status(401).send("Nicht eingeloggt.");

    const body = JSON.parse(req.body || "{}");
    const email = String(body.email || "").trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).send("Ungültige Email.");
    }

    const key = `emails:${username}`;

    // ✅ RICHTIG: ein sauberes Objekt speichern
    await kv.lpush(key, JSON.stringify({
      email,
      ts: Date.now()
    }));

    await kv.ltrim(key, 0, 199);

    return res.status(200).json({ ok: true });

  } catch (err) {
    return res.status(500).send("Serverfehler: " + err.message);
  }
}