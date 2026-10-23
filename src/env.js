import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// A tiny .env reader, so the project needs no dependencies. Values already in
// the environment win over the file.
const file = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(file)) {
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    const value = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (!(key.trim() in process.env)) process.env[key.trim()] = value;
  }
}

function required(name) {
  const value = process.env[name];
  if (!value || value.includes("xxxx")) {
    console.error(`Falta ${name}. Copia .env.example como .env y complétalo.`);
    process.exit(1);
  }
  return value;
}

export const config = {
  apiUrl: required("FIRMAYA_API_URL").replace(/\/$/, ""),
  apiKey: required("FIRMAYA_API_KEY"),
  webhookSecret: required("FIRMAYA_WEBHOOK_SECRET"),
  webhookUrl: process.env.WEBHOOK_URL ?? "",
  port: Number(process.env.PORT ?? 4000),
};
