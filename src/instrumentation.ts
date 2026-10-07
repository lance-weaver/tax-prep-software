export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const missing = ["TAXES_AUTH_USER", "TAXES_AUTH_PASSWORD"].filter(
    (key) => !process.env[key],
  );
  if (missing.length > 0) {
    console.warn(
      `Taxes: set ${missing.join(" and ")} before anyone can sign in. Values live in the host environment, not in the repo.`,
    );
  }
}
