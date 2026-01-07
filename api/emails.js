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
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  try {
    const username = await getUsernameFromToken(req);
    if (!username) return res.status(401).send("Nicht eingeloggt.");

    const key = `emails:${username}`;
    const raw = await kv.lrange(key, 0, -1);

    const emails = [];
    for (const item of raw || []) {
      if (typeof item !== "string") continue;
      try {
        const parsed = JSON.parse(item);
        // ✅ nur gültige Einträge zurückgeben
        if (parsed && typeof parsed.email === "string") {
          emails.push(parsed);
        }
      } catch {
        // kaputt -> ignorieren
      }
    }

    return res.status(200).json({ ok: true, emails });
  } catch (err) {
    console.error("EMAILS ERROR:", err);
    return res.status(500).send("Serverfehler: " + (err?.message || String(err)));
  }
}