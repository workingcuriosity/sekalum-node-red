const { configurationError, protocolError } = require("./errors");

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw configurationError("Sekalum base URL is required.");
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw configurationError("Sekalum base URL must be a valid HTTP(S) URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw configurationError("Sekalum base URL must use HTTP or HTTPS.");
  }
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/$/, "");
}

function normalizeCredentialKey(value) {
  const credentialKey = String(value || "").trim();
  if (!credentialKey) {
    throw protocolError("A credential key is required for Resolve.");
  }
  return credentialKey;
}

function normalizeSecretNames(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  if (values.some((item) => typeof item !== "string")) {
    throw protocolError("Resolve secret names must be strings.");
  }
  const names = [];
  for (const item of values) {
    const name = item.trim();
    if (!name) continue;
    if (name.includes("*")) {
      throw protocolError("Resolve does not support wildcard secret names.");
    }
    if (!names.includes(name)) names.push(name);
  }
  if (names.length === 0) {
    throw protocolError("At least one secret field name is required for Resolve.");
  }
  return names;
}

module.exports = {
  normalizeBaseUrl,
  normalizeCredentialKey,
  normalizeSecretNames
};
