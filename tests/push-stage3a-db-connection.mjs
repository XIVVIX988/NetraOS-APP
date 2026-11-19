import { spawn } from "node:child_process";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
export const REQUIRED_DISPOSABLE_DATABASE = "netraos_push_test";

export function validatePushTestDatabaseUrl(value, disposableFlag) {
  if (disposableFlag !== "1") return { ok: false, code: "DISPOSABLE_OPT_IN_REQUIRED" };
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) return { ok: false, code: "DATABASE_PROTOCOL_REJECTED" };
    if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) return { ok: false, code: "NON_LOOPBACK_HOST_REJECTED" };
    const database = decodeURIComponent(url.pathname.slice(1));
    if (database !== REQUIRED_DISPOSABLE_DATABASE) return { ok: false, code: "DISPOSABLE_DATABASE_NAME_REQUIRED" };
    if (decodeURIComponent(url.username) !== "postgres" || !url.password) return { ok: false, code: "LOCAL_POSTGRES_OWNER_REQUIRED" };
    return {
      ok: true,
      connection: {
        PGHOST: url.hostname.replace(/^\[|\]$/g, ""),
        PGPORT: url.port || "5432",
        PGDATABASE: database,
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGSSLMODE: "disable",
      },
    };
  } catch {
    return { ok: false, code: "MALFORMED_DATABASE_URL" };
  }
}

function spawnPsql(sql, connection, spawnProcess) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
      stdio: ["pipe", "pipe", "ignore"], windowsHide: true,
      env: { ...process.env, ...connection },
    });
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0
      ? resolve(stdout.trim())
      : reject(new Error(`psql exited with code ${code}; database output was suppressed.`)));
    child.stdin.end(sql);
  });
}

// This is the exact execution gate used by the acceptance runner. Validation
// completes before spawnPsql, so rejected input cannot start a SQL process.
export function runValidatedPsql(databaseUrl, disposableFlag, sql, spawnProcess = spawn) {
  const validation = validatePushTestDatabaseUrl(databaseUrl, disposableFlag);
  if (!validation.ok) throw new Error(`Database refused: ${validation.code}`);
  return spawnPsql(sql, validation.connection, spawnProcess);
}
