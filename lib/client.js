const { URL } = require("node:url");
const {
  configurationError,
  errorForStatus,
  networkError,
  protocolError
} = require("./errors");
const { normalizeBaseUrl, normalizeCredentialKey, normalizeSecretNames } = require("./normalize");

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSensitiveKey(key) {
  return /(?:secret|token|password|authorization|private[_-]?key|resolved)/i.test(key);
}

function assertNoSensitiveKeys(value) {
  if (Array.isArray(value)) {
    value.forEach(assertNoSensitiveKeys);
    return;
  }
  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      throw protocolError("Sekalum discovery response contained a prohibited secret field.");
    }
    assertNoSensitiveKeys(nested);
  }
}

function clonePublicProjection(value) {
  if (Array.isArray(value)) return value.map(clonePublicProjection);
  if (!isObject(value)) return value;

  const projection = {};
  for (const [key, nested] of Object.entries(value)) {
    Object.defineProperty(projection, key, {
      value: clonePublicProjection(nested),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return projection;
}

function publicCredential(value) {
  if (!isObject(value) || typeof value.credentialKey !== "string" || !value.credentialKey.trim()) {
    throw protocolError("Sekalum discovery response contained an invalid credential record.");
  }
  assertNoSensitiveKeys(value);
  return clonePublicProjection(value);
}

function discoveryRecords(body) {
  if (!isObject(body) || !isObject(body.data) || !Array.isArray(body.data.credentials)) {
    throw protocolError("Sekalum discovery response had an invalid canonical shape.");
  }
  assertNoSensitiveKeys(body.data);
  return body.data.credentials.map(publicCredential);
}

function resolveValues(body, requestedCredentialKey, requestedSecretNames) {
  if (!isObject(body) || !isObject(body.data) || !isObject(body.data.secrets)) {
    throw protocolError("Sekalum Resolve response had an invalid canonical shape.");
  }
  if (typeof requestedCredentialKey !== "string" || !Array.isArray(requestedSecretNames)) {
    throw protocolError("Sekalum Resolve response could not be matched to the request.");
  }

  const { data } = body;
  if (data.credentialKey !== requestedCredentialKey) {
    throw protocolError("Sekalum Resolve response credential key did not match the request.");
  }
  if (data.lifecycleState !== "active") {
    throw protocolError("Sekalum Resolve response did not confirm an active credential.");
  }
  if (typeof data.providerKey !== "string" || !data.providerKey.trim()) {
    throw protocolError("Sekalum Resolve response did not include a provider key.");
  }

  const requested = new Set(requestedSecretNames);
  const returned = Object.keys(data.secrets);
  if (
    requested.size !== requestedSecretNames.length ||
    returned.length !== requested.size ||
    returned.some((name) => !requested.has(name))
  ) {
    throw protocolError("Sekalum Resolve response returned an unexpected secret field set.");
  }
  for (const name of requestedSecretNames) {
    if (typeof data.secrets[name] !== "string") {
      throw protocolError("Sekalum Resolve response contained a non-string secret value.");
    }
  }

  return Object.fromEntries(requestedSecretNames.map((name) => [name, data.secrets[name]]));
}

class SekalumClient {
  constructor({ baseUrl, token, fetchImpl = globalThis.fetch }) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = String(token || "");
    this.fetchImpl = fetchImpl;
    if (!this.token) throw configurationError("Sekalum Consumer API token is required.");
    if (typeof this.fetchImpl !== "function") throw configurationError("Fetch is unavailable in this Node.js runtime.");
  }

  async request(path, { method = "GET", body } = {}) {
    const url = new URL(path, `${this.baseUrl}/`);
    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${this.token}`,
      "Cache-Control": "no-store"
    };
    const options = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    let response;
    try {
      response = await this.fetchImpl(url, options);
    } catch {
      throw networkError();
    }
    const retryAfter = response.headers && response.headers.get("retry-after");
    if (!response.ok) throw errorForStatus(response.status, retryAfter || null);
    let parsed;
    try {
      parsed = await response.json();
    } catch {
      throw protocolError("Sekalum Consumer API returned a non-JSON success response.");
    }
    return parsed;
  }

  async discover() {
    return discoveryRecords(await this.request("/api/v1/consumer/credentials"));
  }

  async resolve(credentialKey, secretNames) {
    const key = normalizeCredentialKey(credentialKey);
    const names = normalizeSecretNames(secretNames);
    const body = await this.request(
      `/api/v1/consumer/credentials/${encodeURIComponent(key)}/resolve`,
      { method: "POST", body: { secretNames: names } }
    );
    return resolveValues(body, key, names);
  }
}

module.exports = {
  SekalumClient,
  assertNoSensitiveKeys,
  discoveryRecords,
  resolveValues
};
