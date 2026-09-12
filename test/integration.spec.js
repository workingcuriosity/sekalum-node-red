const test = require("node:test");
const assert = require("node:assert/strict");
const { MockConsumerServer } = require("./support/mock-server");
const { executeFlow, startNodeRed, stopNodeRed } = require("./support/node-red-flow");

let server;

function discoveryEnvelope(credentials) {
  return { data: { credentials } };
}

function resolveEnvelope({ credentialKey, lifecycleState = "active", providerKey = "postgres", secrets }) {
  return { data: { credentialKey, lifecycleState, providerKey, secrets } };
}

test.before(async () => {
  server = await new MockConsumerServer().start();
  await startNodeRed();
});

test.after(async () => {
  await stopNodeRed();
  await server.stop();
});

test("T-AUTH-001 uses configured base URL and Consumer bearer token", async () => {
  const token = `auth-${Date.now()}`;
  const result = await executeFlow({
    server,
    token,
    handler: async () => ({ status: 200, body: discoveryEnvelope([]) })
  });
  assert.equal(result.message, null);
  assert.equal(server.requests.length, 1);
  assert.equal(server.requests[0].method, "GET");
  assert.equal(server.requests[0].path, "/api/v1/consumer/credentials");
  assert.equal(server.requests[0].headers.authorization, `Bearer ${token}`);
  assert.equal(server.requests[0].headers["cache-control"], "no-store");
});

test("T-AUTH-INVALID rejects missing Consumer token without a request", async () => {
  const result = await executeFlow({
    server,
    token: "",
    handler: async () => ({ status: 200, body: discoveryEnvelope([]) })
  });
  assert.match(result.error, /token is required/i);
  assert.equal(server.requests.length, 0);
});

test("T-DISC-001 parses the canonical Discovery envelope and preserves its public projection", async () => {
  const publicFields = [
    { fieldKey: "username", displayName: "Username", type: "string" },
    { fieldKey: "region", displayName: "Region", options: ["eu-west-1", "us-east-1"] }
  ];
  const publicProjection = { category: "database", supportsRotation: true };
  const result = await executeFlow({
    server,
    handler: async () => ({
      status: 200,
      body: discoveryEnvelope([{
        credentialKey: "postgres-main",
        providerKey: "postgres",
        displayName: "Postgres",
        fields: publicFields,
        metadata: { providerKey: "postgres", displayName: "Postgres" },
        publicProjection
      }])
    })
  });
  assert.equal(result.message.payload.credentialKey, "postgres-main");
  assert.deepEqual(result.message.payload.fields, publicFields);
  assert.deepEqual(result.message.payload.publicProjection, publicProjection);
  assert.equal(result.message.sekalum.operation, "discover");
});

test("T-DISC-EMPTY returns no messages for an empty authorized collection", async () => {
  const result = await executeFlow({
    server,
    handler: async () => ({ status: 200, body: discoveryEnvelope([]) })
  });
  assert.equal(result.message, null);
  assert.equal(result.error, undefined);
});

test("T-DISC-MALFORMED fails closed for an invalid canonical discovery payload", async () => {
  const result = await executeFlow({
    server,
    handler: async () => ({ status: 200, body: discoveryEnvelope([{ providerKey: "missing-key" }]) })
  });
  assert.match(result.error, /invalid credential record/i);
});

test("T-DISC-FILTER-EMPTY returns every discovered record", async () => {
  const result = await executeFlow({
    server,
    providerFilter: "",
    handler: async () => ({ status: 200, body: discoveryEnvelope([
      { credentialKey: "a", providerKey: "aws" },
      { credentialKey: "b", providerKey: "gcp" }
    ]) })
  });
  assert.equal(result.message.payload.credentialKey, "a");
});

test("T-DISC-FILTER-MATCH filters provider metadata locally", async () => {
  const result = await executeFlow({
    server,
    providerFilter: "display",
    handler: async () => ({ status: 200, body: discoveryEnvelope([
      { credentialKey: "a", providerKey: "aws" },
      { credentialKey: "b", metadata: { displayName: "GCP display" } }
    ]) })
  });
  assert.equal(result.message.payload.credentialKey, "b");
  assert.equal(server.requests[0].path, "/api/v1/consumer/credentials");
});

test("T-DISC-FILTER-NOMATCH emits no message", async () => {
  const result = await executeFlow({
    server,
    providerFilter: "azure",
    handler: async () => ({ status: 200, body: discoveryEnvelope([{ credentialKey: "a", providerKey: "aws" }]) })
  });
  assert.equal(result.message, null);
});

test("T-RESOLVE-001 validates and emits the canonical Resolve envelope", async () => {
  const result = await executeFlow({
    server,
    operation: "resolve",
    credentialKey: "provider/main",
    secretNames: "username, region",
    handler: async () => ({
      status: 200,
      body: resolveEnvelope({
        credentialKey: "provider/main",
        providerKey: "postgres",
        secrets: { username: "alice", region: "eu-west-1" }
      })
    })
  });
  assert.deepEqual(result.message.payload, { username: "alice", region: "eu-west-1" });
  assert.equal(result.message.topic, undefined);
  assert.equal(server.requests[0].method, "POST");
  assert.equal(server.requests[0].path, "/api/v1/consumer/credentials/provider%2Fmain/resolve");
  assert.deepEqual(server.requests[0].body, { secretNames: ["username", "region"] });
});

test("T-RESOLVE-NAMES normalizes, trims and de-duplicates secret names", async () => {
  const result = await executeFlow({
    server,
    operation: "resolve",
    credentialKey: "key",
    secretNames: " one, two, one, ",
    handler: async () => ({
      status: 200,
      body: resolveEnvelope({ credentialKey: "key", secrets: { one: "first", two: "second" } })
    })
  });
  assert.deepEqual(server.requests[0].body.secretNames, ["one", "two"]);
  assert.deepEqual(result.message.payload, { one: "first", two: "second" });
});

test("T-RESOLVE-ENCODE URL-encodes opaque credential keys", async () => {
  const credentialKey = "team key/with?chars";
  const result = await executeFlow({
    server,
    operation: "resolve",
    credentialKey,
    secretNames: "value",
    handler: async () => ({
      status: 200,
      body: resolveEnvelope({ credentialKey, secrets: { value: "ok" } })
    })
  });
  assert.equal(server.requests[0].path, "/api/v1/consumer/credentials/team%20key%2Fwith%3Fchars/resolve");
  assert.equal(result.message.payload.value, "ok");
});

test("T-RESOLVE-REQUESTED-ONLY emits only the exact requested canonical fields", async () => {
  const result = await executeFlow({
    server,
    operation: "resolve",
    credentialKey: "key",
    secretNames: "username",
    input: { payload: "safe-context", topic: "kept" },
    handler: async () => ({
      status: 200,
      body: resolveEnvelope({ credentialKey: "key", secrets: { username: "alice" } })
    })
  });
  assert.deepEqual(result.message.payload, { username: "alice" });
  assert.equal(result.message.topic, "kept");
});

test("T-RESOLVE-CREDENTIAL-KEY rejects a success envelope for another credential", async () => {
  const result = await executeFlow({
    server,
    operation: "resolve",
    credentialKey: "requested-key",
    secretNames: "username",
    handler: async () => ({
      status: 200,
      body: resolveEnvelope({ credentialKey: "other-key", secrets: { username: "alice" } })
    })
  });
  assert.equal(result.message, undefined);
  assert.match(result.error, /credential key.*match/i);
});

test("T-RESOLVE-LIFECYCLE rejects an inactive success envelope", async () => {
  const result = await executeFlow({
    server,
    operation: "resolve",
    credentialKey: "key",
    secretNames: "username",
    handler: async () => ({
      status: 200,
      body: resolveEnvelope({ credentialKey: "key", lifecycleState: "inactive", secrets: { username: "alice" } })
    })
  });
  assert.equal(result.message, undefined);
  assert.match(result.error, /active credential/i);
});

test("T-RESOLVE-PROVIDER rejects a success envelope without a provider key", async () => {
  const result = await executeFlow({
    server,
    operation: "resolve",
    credentialKey: "key",
    secretNames: "username",
    handler: async () => ({
      status: 200,
      body: { data: { credentialKey: "key", lifecycleState: "active", secrets: { username: "alice" } } }
    })
  });
  assert.match(result.error, /provider key/i);
});

test("T-RESOLVE-SECRET-SET rejects unexpected and missing secret fields", async (t) => {
  await t.test("unexpected field", async () => {
    const result = await executeFlow({
      server,
      operation: "resolve",
      credentialKey: "key",
      secretNames: "username",
      handler: async () => ({
        status: 200,
        body: resolveEnvelope({ credentialKey: "key", secrets: { username: "alice", password: "drop" } })
      })
    });
    assert.match(result.error, /unexpected secret field set/i);
  });

  await t.test("missing field", async () => {
    const result = await executeFlow({
      server,
      operation: "resolve",
      credentialKey: "key",
      secretNames: "username, region",
      handler: async () => ({
        status: 200,
        body: resolveEnvelope({ credentialKey: "key", secrets: { username: "alice" } })
      })
    });
    assert.match(result.error, /unexpected secret field set/i);
  });
});

test("T-RESOLVE-STRING-VALUES rejects non-string values", async () => {
  const result = await executeFlow({
    server,
    operation: "resolve",
    credentialKey: "key",
    secretNames: "username",
    handler: async () => ({
      status: 200,
      body: resolveEnvelope({ credentialKey: "key", secrets: { username: 42 } })
    })
  });
  assert.match(result.error, /non-string secret value/i);
});

test("T-NR-CATCH-001 routes done(error) failures to a scoped Catch node", async () => {
  const result = await executeFlow({
    server,
    operation: "resolve",
    credentialKey: "key",
    secretNames: "username",
    handler: async () => ({
      status: 200,
      body: resolveEnvelope({ credentialKey: "key", lifecycleState: "inactive", secrets: { username: "alice" } })
    })
  });
  assert.ok(result.catchMessage);
  assert.equal(result.catchMessage.error.message, result.error);
  assert.match(result.catchMessage.error.message, /active credential/i);
});

test("T-ERR-400, T-ERR-401, T-ERR-403, T-ERR-429 and T-ERR-500 map to safe errors", async (t) => {
  for (const status of [400, 401, 403, 429, 500]) {
    await t.test(`status ${status}`, async () => {
      const result = await executeFlow({
        server,
        operation: "resolve",
        credentialKey: "key",
        secretNames: "username",
        handler: async () => ({ status, retryAfter: status === 429 ? "30" : undefined, body: { secretValue: "should-not-leak" } })
      });
      assert.match(result.error, new RegExp(`\\(${status}\\)`));
      assert.doesNotMatch(result.error, /should-not-leak|Authorization|secretValue/i);
    });
  }
});

test("T-NETWORK maps connection failure to a stable safe error", async () => {
  const result = await executeFlow({
    server,
    baseUrl: "http://127.0.0.1:1",
    handler: async () => ({ status: 200, body: discoveryEnvelope([]) })
  });
  assert.match(result.error, /network request failed/i);
});

test("T-LIFE-DENIED preserves server denial semantics", async () => {
  const result = await executeFlow({
    server,
    operation: "resolve",
    credentialKey: "key",
    secretNames: "username",
    handler: async () => ({ status: 403, body: { detail: "denied", resolved: "canary" } })
  });
  assert.equal(result.message, undefined);
  assert.match(result.error, /access was denied/);
});

test("T-RUNTIME catches malformed asynchronous responses without uncaught errors", async () => {
  const result = await executeFlow({
    server,
    operation: "resolve",
    credentialKey: "key",
    secretNames: "username",
    handler: async () => ({ status: 200, body: [] })
  });
  assert.match(result.error, /invalid canonical shape/i);
});
