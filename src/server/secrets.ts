import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { config } from "./config.ts";

const PREFIX = "enc:v1:";

let cachedKey: Buffer | undefined;

/** 32-byte key from SECRET_KEY (64 hex chars) or a generated 0600 file next to the database. */
function getKey(): Buffer {
  const fromEnv = process.env["SECRET_KEY"];
  if (fromEnv) {
    if (!/^[0-9a-f]{64}$/i.test(fromEnv)) {
      throw new Error("SECRET_KEY must be 64 hex characters");
    }
    return Buffer.from(fromEnv, "hex");
  }
  if (cachedKey) return cachedKey;
  const path = join(dirname(config.dbPath), "secret.key");
  if (existsSync(path)) {
    cachedKey = Buffer.from(readFileSync(path, "utf8").trim(), "hex");
  } else {
    mkdirSync(dirname(path), { recursive: true });
    const key = randomBytes(32);
    writeFileSync(path, key.toString("hex"), { mode: 0o600 });
    chmodSync(path, 0o600);
    cachedKey = key;
  }
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${[iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".")}`;
}

/** Decrypts a stored secret. Values without the prefix are legacy plaintext and returned as-is. */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const [iv, tag, data] = stored
    .slice(PREFIX.length)
    .split(".")
    .map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !data) throw new Error("corrupt secret");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

/** Derives a purpose-specific 32-byte key from the master key. */
export function deriveKey(label: string): Buffer {
  return createHmac("sha256", getKey()).update(label).digest();
}
