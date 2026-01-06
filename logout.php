<?php
ini_set('session.cookie_httponly', 1);   // JS kann Cookie nicht lesen
ini_set('session.use_only_cookies', 1); // Keine Session-IDs in URLs

// NUR aktivieren, wenn deine Seite über HTTPS läuft!
ini_set('session.cookie_secure', 1);

// CSRF-Schutz (meist beste Wahl)
ini_set('session.cookie_samesite', 'Lax');

session_start();

/*
  Alle Session-Daten entfernen
*/
session_unset();

/*
  Session komplett zerstören
*/
session_destroy();

/*
  Optional: Session-Cookie löschen (sauberste Variante)
*/
if (ini_get("session.use_cookies")) {
  $params = session_get_cookie_params();
  setcookie(
    session_name(),
    '',
    time() - 42000,
    $params["path"],
    $params["domain"],
    $params["secure"],
    $params["httponly"]
  );
}

/*
  Zurück zum Login
*/
header("Location: login.html");
exit;