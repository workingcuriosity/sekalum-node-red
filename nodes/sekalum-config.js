const { SekalumClient } = require("../lib/client");

module.exports = function registerSekalumConfig(RED) {
  function SekalumConfig(config) {
    RED.nodes.createNode(this, config);
    this.baseUrl = config.baseUrl;
    this.getClient = () => new SekalumClient({
      baseUrl: this.baseUrl,
      token: this.credentials && this.credentials.token
    });
  }

  RED.nodes.registerType("sekalum-config", SekalumConfig, {
    credentials: {
      token: { type: "password" }
    }
  });
};
