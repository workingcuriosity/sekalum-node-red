const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const nodeRuntime = fs.readFileSync(path.join(root, "nodes/sekalum.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "lib/client.js"), "utf8");
const operationEditor = fs.readFileSync(path.join(root, "nodes/sekalum.html"), "utf8");
const configEditor = fs.readFileSync(path.join(root, "nodes/sekalum-config.html"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const example = JSON.parse(fs.readFileSync(path.join(root, "examples/basic-flow.json"), "utf8"));
const packagedIcon = path.join(root, "nodes/icons/sekalum-icon.png");
const { discoveryRecords, resolveValues } = require("../lib/client");
const { SekalumError } = require("../lib/errors");
const registerOperationNode = require("../nodes/sekalum");

test("T-ARCH-001 runtime and editor definitions are registered", () => {
  assert.equal(packageJson["node-red"].nodes.sekalum, "nodes/sekalum.js");
  assert.equal(packageJson["node-red"].nodes["sekalum-config"], "nodes/sekalum-config.js");
  for (const file of ["nodes/sekalum.js", "nodes/sekalum.html", "nodes/sekalum-config.js", "nodes/sekalum-config.html"]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }
});

test("T-PKG-002 package mapping is complete", () => {
  assert.deepEqual(Object.keys(packageJson["node-red"].nodes).sort(), ["sekalum", "sekalum-config"]);
});

test("T-PKG-003 supported Node-RED range is declared", () => {
  assert.equal(packageJson["node-red"].version, ">=5.0.0 <6.0.0");
  assert.equal(packageJson.devDependencies["node-red"], "5.0.7");
  assert.equal(packageJson.engines.node, ">=24.0.0 <25.0.0");
});

test("T-PKG-005 public package metadata is release-ready", () => {
  assert.equal(packageJson.private, undefined);
  assert.equal(packageJson.name, "@workingcuriosity/node-red-sekalum");
  assert.equal(packageJson.license, "MIT");
  assert.deepEqual(packageJson.author, { name: "Working Curiosity", email: "luiscyphre404@gmail.com" });
  assert.equal(packageJson.publishConfig.access, "public");
});

test("T-PKG-004 runtime imports have no undeclared external dependencies", () => {
  assert.deepEqual(Object.keys(packageJson.dependencies), []);
  assert.match(clientSource, /require\("node:url"\)/);
  assert.doesNotMatch(clientSource, /require\("(?:node-red|node-red-node-test-helper)"\)/);
});

test("T-DOC-001 README covers capabilities and prerequisites", () => {
  for (const section of ["Prerequisites", "Setup and configuration", "Discover", "Resolve", "Outputs and errors", "Security boundary", "Example", "Development and tests"]) {
    assert.match(readme, new RegExp(`## ${section}`));
  }
});

test("T-LIC-001 license identifies the confirmed copyright holder", () => {
  const license = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2026 Working Curiosity/);
  assert.doesNotMatch(license, /Pending user copyright-holder decision/);
});

test("T-UX-001 editor exposes only relevant operation fields", () => {
  assert.match(operationEditor, /value="discover"/);
  assert.match(operationEditor, /value="resolve"/);
  assert.match(operationEditor, /node-input-providerFilter/);
  assert.match(operationEditor, /node-input-credentialKey/);
  assert.match(operationEditor, /node-input-secretNames/);
  assert.doesNotMatch(operationEditor, /node-input-secretValue|node-input-token/);
  assert.match(operationEditor, /toggleFields/);
  assert.match(configEditor, /type="password"/);
});

test("T-BRAND-001 packages the official Sekalum icon", () => {
  assert.equal(fs.existsSync(packagedIcon), true, "Node-RED package icon");
  assert.ok(fs.statSync(packagedIcon).size > 0);
  assert.match(operationEditor, /icon:\s*'sekalum-icon\.png'/);
  assert.doesNotMatch(operationEditor, /icon:\s*'icons\/sekalum-icon\.png'/);
  assert.doesNotMatch(operationEditor, /font-awesome\/fa-key/);
  assert.equal(packageJson.files.includes("nodes"), true);
});

test("T-CRED-EDITOR editor source does not expose a stored token", () => {
  assert.doesNotMatch(configEditor, /credentials\.token/);
  assert.doesNotMatch(configEditor, /token:\s*\{\s*value/);
  assert.match(configEditor, /credentials:/);
});

test("T-CRED-EXPORT exported example has no consumer token", () => {
  const exported = JSON.stringify(example);
  assert.doesNotMatch(exported, /consumer[_-]?api[_-]?token/i);
  assert.deepEqual(example.find((node) => node.type === "sekalum-config").credentials, {});
});

test("T-CONFIG-001 multiple operation nodes reference one config node", () => {
  const operations = example.filter((node) => node.type === "sekalum");
  assert.equal(operations.length, 2);
  assert.deepEqual([...new Set(operations.map((node) => node.sekalumConfig))], ["sekalum-config"]);
});

test("T-EXAMPLE-001 example uses only core and Sekalum node types", () => {
  const allowed = new Set(["inject", "debug", "sekalum", "sekalum-config"]);
  for (const node of example) assert.equal(allowed.has(node.type), true, node.type);
  assert.doesNotMatch(JSON.stringify(example), /Bearer|token|password|secretValue/i);
});

test("T-REL-001 public baseline is documented in the changelog", () => {
  assert.match(changelog, /^## \[0\.1\.0\] - 2026-09-12/m);
  assert.match(readme, /Semantic Versioning/);
});

test("T-SCOPE-001 initial scope is exactly Discover and Resolve", () => {
  const values = [...operationEditor.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(values, ["discover", "resolve"]);
  assert.doesNotMatch(operationEditor + nodeRuntime, /batch[ -]?resolve/i);
});

test("T-HTTP-NOCACHE and T-HTTP-NORETRY no cache or automatic retry exists", () => {
  assert.match(clientSource, /Cache-Control.*no-store/);
  assert.doesNotMatch(clientSource, /setTimeout|retry\s*\(/i);
  assert.doesNotMatch(clientSource, /\b(?:cache|responseCache)\s*=|new Map/i);
});

test("T-DISC-CANONICAL-PROJECTION accepts only body.data.credentials and preserves public fields", () => {
  const fields = [{ fieldKey: "username", type: "string" }];
  const records = discoveryRecords({ data: { credentials: [{ credentialKey: "postgres-main", providerKey: "postgres", fields, publicProjection: { category: "database" } }] } });
  assert.deepEqual(records, [{ credentialKey: "postgres-main", providerKey: "postgres", fields, publicProjection: { category: "database" } }]);
  assert.throws(() => discoveryRecords({ credentials: [] }), /canonical shape/i);
});

test("T-RESOLVE-CANONICAL-VALIDATION requires matching active canonical data with exact string fields", () => {
  const body = { data: { credentialKey: "postgres-main", lifecycleState: "active", providerKey: "postgres", secrets: { username: "alice", region: "eu-west-1" } } };
  assert.deepEqual(resolveValues(body, "postgres-main", ["username", "region"]), { username: "alice", region: "eu-west-1" });
  assert.throws(() => resolveValues(body, "other-key", ["username", "region"]), /credential key.*match/i);
  assert.throws(() => resolveValues({ data: { ...body.data, lifecycleState: "inactive" } }, "postgres-main", ["username", "region"]), /active credential/i);
  assert.throws(() => resolveValues({ data: { ...body.data, secrets: { username: "alice", extra: "value" } } }, "postgres-main", ["username"]), /unexpected secret field set/i);
});

test("T-NR-DONE-SEMANTICS uses done(error) or node.error(error, msg) without a success completion", async () => {
  let OperationNode;
  const expected = new SekalumError("Safe test failure.");
  const connection = { getClient: () => ({ discover: async () => { throw expected; } }) };
  const RED = {
    nodes: {
      createNode(node) { node.errorCalls = []; node.error = (...args) => node.errorCalls.push(args); node.send = () => {}; node.on = (event, handler) => { if (event === "input") node.inputHandler = handler; }; },
      getNode: () => connection,
      registerType: (_name, constructor) => { OperationNode = constructor; }
    },
    util: { cloneMessage: (message) => ({ ...message }) }
  };
  registerOperationNode(RED);

  const withDone = new OperationNode({ sekalumConfig: "connection", operation: "discover" });
  const withDoneMessage = { payload: "original" };
  let doneArgument;
  await withDone.inputHandler(withDoneMessage, undefined, (error) => { doneArgument = error; });
  assert.equal(doneArgument, expected);
  assert.deepEqual(withDone.errorCalls, []);

  const withoutDone = new OperationNode({ sekalumConfig: "connection", operation: "discover" });
  const withoutDoneMessage = { payload: "original" };
  await withoutDone.inputHandler(withoutDoneMessage);
  assert.deepEqual(withoutDone.errorCalls, [[expected, withoutDoneMessage]]);
});
