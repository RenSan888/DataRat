#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, ".env");
const outputPath = path.join(repoRoot, "my-extension", "env.json");

function parseEnvFile(raw) {
  const values = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIdx = trimmed.indexOf("=");
    if (equalsIdx === -1) continue;

    const key = trimmed.slice(0, equalsIdx).trim();
    let value = trimmed.slice(equalsIdx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

if (!fs.existsSync(envPath)) {
  console.error(".env not found at project root.");
  console.error("Create it first, for example: GEMINI_API_KEY=your_key_here");
  process.exit(1);
}

const envRaw = fs.readFileSync(envPath, "utf8");
const env = parseEnvFile(envRaw);
const apiKey = (env.GEMINI_API_KEY || "").trim();

if (!apiKey) {
  console.error("GEMINI_API_KEY is missing or empty in .env");
  process.exit(1);
}

const payload = {
  GEMINI_API_KEY: apiKey,
};

fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath}`);
