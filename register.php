<?php
require __DIR__ . "/csrf.php";
csrf_init();
csrf_verify_or_die();

$servername = "localhost";
$dbname = "users_db";
$dbuser = "root";
$dbpass = "";

try {
  $conn = new PDO("mysql:host=$servername;dbname=$dbname;charset=utf8mb4", $dbuser, $dbpass);
  $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  $username = trim($_POST["username"] ?? "");
  $password = $_POST["password"] ?? "";
  $confirm  = $_POST["confirm_password"] ?? "";

  if ($username === "" || $password === "" || $confirm === "") {
    header("Location: register_form.php?error=2");
    exit;
  }

  if ($password !== $confirm) {
    header("Location: register_form.php?error=4");
    exit;
  }

  $hash = password_hash($password, PASSWORD_DEFAULT);
  $stmt = $conn->prepare("INSERT INTO users (username, password) VALUES (?, ?)");
  $stmt->execute([$username, $hash]);

  session_regenerate_id(true);
  $_SESSION["user_id"] = $conn->lastInsertId();
  $_SESSION["username"] = $username;

  header("Location: dashboard.php");
  exit;

} catch (PDOException $e) {
  if ($e->getCode() == 23000) {
    header("Location: register_form.php?error=1");
    exit;
  }
  header("Location: register_form.php?error=3");
  exit;
}