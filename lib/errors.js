class SekalumError extends Error {
  constructor(message, { code = "SEKALUM_ERROR", status = null, retryAfter = null } = {}) {
    super(message);
    this.name = "SekalumError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const STATUS_MESSAGES = new Map([
  [400, "Sekalum Consumer API rejected the request (400)."],
  [401, "Sekalum Consumer API authentication failed (401)."],
  [403, "Sekalum Consumer API access was denied (403)."],
  [429, "Sekalum Consumer API rate limit reached (429)."],
  [500, "Sekalum Consumer API returned a server error (500)."]
]);

function errorForStatus(status, retryAfter) {
  return new SekalumError(
    STATUS_MESSAGES.get(status) || `Sekalum Consumer API request failed (${status}).`,
    { code: `SEKALUM_HTTP_${status}`, status, retryAfter }
  );
}

function protocolError(message = "Sekalum Consumer API returned an invalid response.") {
  return new SekalumError(message, { code: "SEKALUM_PROTOCOL_ERROR" });
}

function configurationError(message) {
  return new SekalumError(message, { code: "SEKALUM_CONFIGURATION_ERROR" });
}

function networkError() {
  return new SekalumError("Sekalum Consumer API network request failed.", {
    code: "SEKALUM_NETWORK_ERROR"
  });
}

module.exports = {
  SekalumError,
  configurationError,
  errorForStatus,
  networkError,
  protocolError
};
