const http = require("node:http");

class MockConsumerServer {
  constructor() {
    this.requests = [];
    this.handler = async () => ({ status: 500, body: {} });
    this.server = http.createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString("utf8");
      let body = null;
      if (rawBody) {
        try { body = JSON.parse(rawBody); } catch { body = rawBody; }
      }
      this.requests.push({
        method: request.method,
        path: request.url,
        headers: { ...request.headers },
        body
      });
      try {
        const result = await this.handler(request, body);
        response.statusCode = result.status || 200;
        response.setHeader("content-type", "application/json");
        if (result.retryAfter) response.setHeader("retry-after", result.retryAfter);
        response.end(JSON.stringify(result.body === undefined ? {} : result.body));
      } catch {
        response.statusCode = 500;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ error: "mock failure" }));
      }
    });
  }

  async start() {
    await new Promise((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    const address = this.server.address();
    this.url = `http://127.0.0.1:${address.port}`;
    return this;
  }

  async stop() {
    await new Promise((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
  }
}

module.exports = { MockConsumerServer };
