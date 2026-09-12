function text(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function filterCredentials(credentials, providerFilter) {
  const filter = text(String(providerFilter || "").trim());
  if (!filter) return credentials;
  return credentials.filter((credential) => {
    const candidates = [
      credential.providerKey,
      credential.metadata && credential.metadata.providerKey,
      credential.metadata && credential.metadata.displayName
    ];
    return candidates.some((candidate) => text(candidate).includes(filter));
  });
}

module.exports = { filterCredentials };
