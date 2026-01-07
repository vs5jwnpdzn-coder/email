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

function isValidEmail(s) {
  if (typeof s !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(s.trim());
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  try {
    const username = await getUsernameFromToken(req);
    if (!username) return res.status(401).send("Nicht eingeloggt.");

    const key = `emails:${username}`;

    // hol dir z.B. die letzten 200
    const raw = await kv.lrange(key, 0, 199);

    const emails = [];

    for (const item of raw || []) {
      // 1) Falls KV schon Objekte zurückgibt
      if (item && typeof item === "object") {
        if (typeof item.email === "string" && isValidEmail(item.email)) {
          emails.push({ email: item.email.trim(), ts: item.ts ?? null });
        }
        continue;
      }

      // 2) Falls KV Strings zurückgibt
      if (typeof item === "string") {
        // 2a) JSON-String?
        try {
          const parsed = JSON.parse(item);
          if (parsed && typeof parsed.email === "string" && isValidEmail(parsed.email)) {
            emails.push({ email: parsed.email.trim(), ts: parsed.ts ?? null });
            continue;
          }
        } catch {
          // ignore -> vielleicht Plain-String
        }

        // 2b) Plain Email-String (altes Format)
        if (isValidEmail(item)) {
          emails.push({ email: item.trim(), ts: null });
        }
      }
    }

    return res.status(200).json({
      ok: true,
      emails,
      debug: {
        username,
        key,
        rawCount: (raw || []).length,
        parsedCount: emails.length,
        sampleTypes: (raw || []).slice(0, 5).map(v => (v === null ? "null" : typeof v))
      }
    });
  } catch (err) {
    console.error("EMAILS ERROR:", err);
    return res.status(500).send("Serverfehler: " + (err?.message || String(err)));
  }
}