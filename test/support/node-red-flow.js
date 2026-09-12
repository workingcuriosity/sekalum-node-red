const { randomUUID } = require("node:crypto");
const helper = require("node-red-node-test-helper");
const configNode = require("../../nodes/sekalum-config");
const operationNode = require("../../nodes/sekalum");

let initialized = false;

async function startNodeRed() {
  if (!initialized) {
    helper.init(require.resolve("node-red"));
    await helper.startServer();
    initialized = true;
  }
}

async function stopNodeRed() {
  if (initialized) {
    await helper.stopServer();
    initialized = false;
  }
}

async function executeFlow({
  server,
  operation = "discover",
  providerFilter = "",
  credentialKey = "",
  secretNames = "",
  input = { payload: "original", context: "safe" },
  token = `test-token-${randomUUID()}`,
  baseUrl = server.url,
  captureCatch = true,
  handler
}) {
  server.requests.length = 0;
  server.handler = handler;
  const flowId = `flow-${randomUUID()}`;
  const configId = `config-${randomUUID()}`;
  const operationId = `operation-${randomUUID()}`;
  const sinkId = `sink-${randomUUID()}`;
  const catchId = `catch-${randomUUID()}`;
  const catchSinkId = `catch-sink-${randomUUID()}`;
  const flow = [
    { id: flowId, type: "tab", label: "test" },
    {
      id: configId,
      type: "sekalum-config",
      name: "test connection",
      baseUrl,
      z: flowId
    },
    {
      id: operationId,
      z: flowId,
      type: "sekalum",
      name: "test operation",
      sekalumConfig: configId,
      operation,
      providerFilter,
      credentialKey,
      secretNames,
      wires: [[sinkId]]
    },
    { id: sinkId, z: flowId, type: "helper" }
  ];
  if (captureCatch) {
    flow.push(
      {
        id: catchId,
        z: flowId,
        type: "catch",
        name: "capture Sekalum errors",
        scope: [operationId],
        uncaught: false,
        wires: [[catchSinkId]]
      },
      { id: catchSinkId, z: flowId, type: "helper" }
    );
  }

  await helper.load([configNode, operationNode], flow, { [configId]: { token } });
  const node = helper.getNode(operationId);
  const sink = helper.getNode(sinkId);
  const catchSink = captureCatch ? helper.getNode(catchSinkId) : null;
  const result = await new Promise((resolve) => {
    let completed = false;
    const finish = (value) => {
      if (completed) return;
      completed = true;
      resolve(value);
    };
    sink.on("input", (message) => finish({ message }));
    if (catchSink) {
      catchSink.on("input", (message) => finish({
        error: message && message.error && message.error.message,
        catchMessage: message
      }));
    } else {
      node.on("call:error", (call) => {
        const error = call.args[0];
        finish({ error: error && error.message ? error.message : error });
      });
    }
    node.receive(input);
    setTimeout(() => finish({ message: null }), 500);
  });
  await helper.unload();
  return result;
}

module.exports = { executeFlow, startNodeRed, stopNodeRed };
