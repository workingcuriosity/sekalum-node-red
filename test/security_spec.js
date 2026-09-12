const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { MockConsumerServer } = require("./support/mock-server");
const { executeFlow, startNodeRed, stopNodeRed } = require("./support/node-red-flow");

let server;

function discoveryEnvelope(credentials) {
  return { data: { credentials } };
}

function resolveEnvelope(credentialKey, secrets) {
  return {
    data: {
      credentialKey,
      lifecycleState: "active",
      providerKey: "postgres",
      secrets
    }
  };
}

test.before(async () => {
  server = await new MockConsumerServer().start();
  await startNodeRed();
});

test.after(async () => {
  await stopNodeRed();
  await server.stop();
});

test("T-SEC-CANARY secret canary occurs only in expected runtime output", async () => {
  const canary = `CANARY-${randomUUID()}`;
  const result = await executeFlow({
    server,
    operation: "resolve",
    credentialKey: "key",
    secretNames: "username",
    handler: async () => ({ status: 200, body: resolveEnvelope("key", { username: canary }) })
  });
  assert.equal(result.message.payload.username, canary);
  assert.equal(server.requests.some((request) => JSON.stringify(request).includes(canary)), false);
});

test("T-SEC-LOG secret canary is absent from errors and console output", async () => {
  const canary = `CANARY-${randomUUID()}`;
  const calls = [];
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const name of Object.keys(original)) console[name] = (...args) => calls.push(args.join(" "));
  let result;
  try {
    result = await executeFlow({
      server,
      handler: async () => ({
        status: 200,
        body: discoveryEnvelope([{ credentialKey: "key", secretValue: canary }])
      })
    });
  } finally {
    for (const name of Object.keys(original)) console[name] = original[name];
  }
  assert.match(result.error, /prohibited secret field/);
  assert.doesNotMatch(result.error, new RegExp(canary));
  assert.equal(calls.some((call) => call.includes(canary)), false);
});

test("T-SEC-CONTEXT resolved canary is not copied into non-payload context", async () => {
  const canary = `CANARY-${randomUUID()}`;
  const result = await executeFlow({
    server,
    operation: "resolve",
    credentialKey: "key",
    secretNames: "username",
    input: { payload: "safe", context: "safe-context" },
    handler: async () => ({ status: 200, body: resolveEnvelope("key", { username: canary }) })
  });
  assert.equal(result.message.context, "safe-context");
  assert.equal(result.message.sekalum.credentialKey, "key");
  assert.doesNotMatch(JSON.stringify(result.message.sekalum), new RegExp(canary));
});

test("T-SEC-URL resolved canary is never placed in a URL", async () => {
  const canary = `CANARY-${randomUUID()}`;
  const result = await executeFlow({
    server,
    operation: "resolve",
    credentialKey: "key",
    secretNames: "username",
    handler: async () => ({ status: 200, body: resolveEnvelope("key", { username: canary }) })
  });
  assert.equal(result.message.payload.username, canary);
  assert.equal(server.requests.every((request) => !request.path.includes(canary)), true);
});

test("T-SEC-CRED resolved values are not written to logs when the server denies access", async () => {
  const canary = `CANARY-${randomUUID()}`;
  const result = await executeFlow({
    server,
    operation: "resolve",
    credentialKey: "key",
    secretNames: "username",
    handler: async () => ({ status: 403, body: { resolved: canary, message: canary } })
  });
  assert.match(result.error, /access was denied/);
  assert.doesNotMatch(result.error, new RegExp(canary));
});
