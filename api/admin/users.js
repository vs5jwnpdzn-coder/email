export const config = { runtime: "nodejs" };

import { kv } from "@vercel/kv";
import { jwtVerify } from "jose";

function getCookie(req, name) {
  const cookie = req.headers.cookie || "";
  const parts = cookie.split(";").map(p => p.trim());
  const found = parts.find(p => p.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : "";
}

async function requireAdmin(req) {
  const token = getCookie(req, "token");
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    if (payload.role !== "admin") return null;
    return payload;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).send("Forbidden");

  try {
    // ✅ Alle User kommen aus einem Set, das wir beim Registrieren pflegen
    const users = await kv.smembers("users"); // Array

    // Sortiert für saubere Anzeige
    const sorted = (users || [])
      .filter(u => typeof u === "string" && u.trim())
      .map(u => u.trim().toLowerCase())
      .sort((a, b) => a.localeCompare(b, "de"));

    return res.status(200).json({ ok: true, users: sorted });
  } catch (err) {
    console.error("ADMIN USERS ERROR:", err);
    return res.status(500).send("Serverfehler");
  }
}