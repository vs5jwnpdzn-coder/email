export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  // Token-Cookie wirklich löschen (mehrere Varianten als Fallback)
  res.setHeader("Set-Cookie", [
    "token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax; Secure",
    "token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax"
  ]);

  return res.status(200).json({ ok: true });
}