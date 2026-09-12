const { filterCredentials } = require("../lib/filter");
const { configurationError, protocolError, SekalumError } = require("../lib/errors");
const { normalizeCredentialKey, normalizeSecretNames } = require("../lib/normalize");

function safeNodeRedError(error) {
  if (error instanceof SekalumError) return error;
  return protocolError("Sekalum operation failed.");
}

module.exports = function registerSekalum(RED) {
  function SekalumNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.operation = config.operation || "discover";
    node.providerFilter = config.providerFilter || "";
    node.credentialKey = config.credentialKey || "";
    node.secretNames = config.secretNames || "";
    node.sekalumConfig = RED.nodes.getNode(config.sekalumConfig);

    node.on("input", async (msg, send, done) => {
      const emit = send || node.send.bind(node);
      try {
        if (!node.sekalumConfig) throw configurationError("Sekalum config node is not configured.");
        const client = node.sekalumConfig.getClient();
        if (node.operation === "discover") {
          const credentials = filterCredentials(await client.discover(), node.providerFilter);
          for (const credential of credentials) {
            const output = RED.util.cloneMessage(msg);
            output.payload = credential;
            output.sekalum = { operation: "discover", credentialKey: credential.credentialKey };
            emit(output);
          }
        } else if (node.operation === "resolve") {
          const credentialKey = normalizeCredentialKey(node.credentialKey);
          const secretNames = normalizeSecretNames(node.secretNames);
          const output = RED.util.cloneMessage(msg);
          output.payload = await client.resolve(credentialKey, secretNames);
          output.sekalum = { operation: "resolve", credentialKey };
          emit(output);
        } else {
          throw protocolError(`Unsupported Sekalum operation: ${node.operation}`);
        }
        if (typeof done === "function") done();
      } catch (error) {
        const safeError = safeNodeRedError(error);
        if (typeof done === "function") {
          done(safeError);
        } else {
          node.error(safeError, msg);
        }
      }
    });
  }

  RED.nodes.registerType("sekalum", SekalumNode);
};
