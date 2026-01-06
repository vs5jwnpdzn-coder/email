<?php
// csrf.php
// Diese Datei wird in Seiten/Handler eingebunden.

function csrf_init(): void {
  // Session-Cookie Security (lokal ggf. secure aus)
  ini_set('session.cookie_httponly', 1);
  ini_set('session.use_only_cookies', 1);
  // ini_set('session.cookie_secure', 1); // NUR bei HTTPS!
  ini_set('session.cookie_samesite', 'Lax');

  if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
  }
}

function csrf_token(): string {
  if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
  }
  return $_SESSION['csrf_token'];
}

function csrf_verify_or_die(): void {
  $sent = $_POST['csrf_token'] ?? '';
  $real = $_SESSION['csrf_token'] ?? '';
  if (!$sent || !$real || !hash_equals($real, $sent)) {
    http_response_code(403);
    exit('Ungültige Anfrage (CSRF).');
  }
}