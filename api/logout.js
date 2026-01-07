export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

  const isProd = process.env.NODE_ENV === "production";

  res.setHeader("Set-Cookie", [
    [
      "token=",
      "Path=/",
      "HttpOnly",
      "Max-Age=0",
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      isProd ? "SameSite=None" : "SameSite=Lax",
      isProd ? "Secure" : ""
    ].filter(Boolean).join("; ")
  ]);

  res.status(200).json({ ok: true });
}