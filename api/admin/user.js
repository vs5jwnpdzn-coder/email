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

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;

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
  return /^[a-z0-9_-]{3,20}$/.test(u);
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).send("Forbidden");

  try {
    // -----------------------------
    // DELETE = User komplett löschen
    // -----------------------------
    if (req.method === "DELETE") {
      const body = await readJson(req);
      const username = normalizeUsername(body.username);

      if (!username) return res.status(400).send("username fehlt");
      if (username === "gzuz") return res.status(403).send("Admin-User kann nicht gelöscht werden.");

      const userKey = `user:${username}`;
      const emailsKey = `emails:${username}`;

      const exists = await kv.get(userKey);
      if (!exists) return res.status(404).send("User nicht gefunden.");

      let emailCount = 0;
      try { emailCount = await kv.llen(emailsKey); } catch { emailCount = 0; }

      await kv.del(userKey);
      await kv.del(emailsKey);
      await kv.srem("users", username);

      return res.status(200).json({
        ok: true,
        username,
        deletedEmails: emailCount
      });
    }

    // -----------------------------
    // PATCH = User umbenennen
    // Body: { oldUsername, newUsername }
    // -----------------------------
    if (req.method === "PATCH") {
      const body = await readJson(req);
      const oldUsername = normalizeUsername(body.oldUsername);
      const newUsername = normalizeUsername(body.newUsername);

      if (!oldUsername || !newUsername) return res.status(400).send("oldUsername/newUsername fehlt");
      if (oldUsername === "gzuz") return res.status(403).send("Admin-User kann nicht umbenannt werden.");
      if (!isValidUsername(newUsername)) return res.status(400).send("Neuer Username ungültig (3–20 Zeichen, a-z 0-9 _ -).");
      if (oldUsername === newUsername) return res.status(400).send("Username ist identisch.");

      const oldUserKey = `user:${oldUsername}`;
      const newUserKey = `user:${newUsername}`;
      const oldEmailsKey = `emails:${oldUsername}`;
      const newEmailsKey = `emails:${newUsername}`;

      const oldUser = await kv.get(oldUserKey);
      if (!oldUser) return res.status(404).send("Alter User nicht gefunden.");

      const newExists = await kv.get(newUserKey);
      if (newExists) return res.status(409).send("Neuer Username ist bereits vergeben.");

      // Emails lesen (alle)
      const rawEmails = await kv.lrange(oldEmailsKey, 0, -1);
      const emailCount = (rawEmails || []).length;

      // User schreiben (optional username feld updaten)
      const newUserObj = { ...(oldUser || {}), username: newUsername };
      await kv.set(newUserKey, newUserObj);

      // Emails umziehen
      await kv.del(newEmailsKey); // falls irgendwas vorhanden wäre
      if (rawEmails && rawEmails.length > 0) {
        await kv.rpush(newEmailsKey, ...rawEmails);
      }

      // Alte keys löschen
      await kv.del(oldUserKey);
      await kv.del(oldEmailsKey);

      // users-set updaten
      await kv.srem("users", oldUsername);
      await kv.sadd("users", newUsername);

      return res.status(200).json({
        ok: true,
        oldUsername,
        newUsername,
        movedEmails: emailCount
      });
    }

    return res.status(405).send("Method not allowed");
  } catch (err) {
    console.error("ADMIN USER ERROR:", err);
    return res.status(500).send("Serverfehler");
  }
}