export default async function handler(req, res) {
  // Cookie löschen (Token invalidieren)
  res.setHeader("Set-Cookie", [
    "token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
  ]);

  return res.status(200).json({ ok: true });
}