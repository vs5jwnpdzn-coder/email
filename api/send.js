export const config = { runtime: "nodejs" };

import { kv } from "@vercel/kv";
import { jwtVerify } from "jose";
import { json } from "micro";

function getCookie(req, name) {
  const cookie = req.headers.cookie || "";
  const parts = cookie.split(";").map(p => p.trim());
  const found = parts.find(p => p.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : "";
}

async function getUsername(req) {
  const token = getCookie(req, "token");
  if (!token) return null;

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  return String(payload.username);
}

function normalizeEmail(s) {
  return String(s || "").trim().toLowerCase();
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const username = await getUsername(req);
    if (!username) return res.status(401).send("Nicht eingeloggt");

    const body = await json(req);
    const email = normalizeEmail(body?.email);

    if (!email) return res.status(400).send("Bitte eine Email eingeben.");
    if (!isValidEmail(email)) return res.status(400).send("Ungültige Email");

    const listKey = `emails:${username}`;
    const setKey  = `emailset:${username}`; // ✅ für Duplikat-Check

    // ✅ Duplikat prüfen
    const exists = await kv.sismember(setKey, email);
    if (exists) {
      return res.status(409).send("Diese Email hast du bereits gespeichert.");
    }

    // ✅ erst Set, dann List (damit Uniqueness garantiert bleibt)
    await kv.sadd(setKey, email);
    await kv.lpush(listKey, JSON.stringify({ email, ts: Date.now() }));

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("SEND ERROR:", err);
    return res.status(500).send("Serverfehler: " + (err?.message || String(err)));
  }
}