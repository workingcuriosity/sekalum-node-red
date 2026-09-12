# Sekalum Node-RED integration

Node-RED nodes for the public Sekalum Consumer API. Maintained by Working
Curiosity.

The package provides two operation modes: **Discover** and **Resolve**. It is
published as `@workingcuriosity/node-red-sekalum`.

## Prerequisites

- Node-RED `>=5.0.0 <6.0.0`.
- Node.js `>=24.0.0 <25.0.0`.
- A Sekalum Consumer API base URL.
- A Consumer API bearer token with the `credentials:consume` scope.

The token must be entered through Node-RED credential storage. It is never a
node property or part of an exported flow.

## Installation

Install the package in the Node-RED project and restart Node-RED:

```text
npm install @workingcuriosity/node-red-sekalum
```

Add one **Sekalum connection** configuration node and enter the base URL and
Consumer API token. Reuse that configuration node from one or more Sekalum
operation nodes.

## Setup and configuration

The integration sends `Authorization: Bearer <Consumer API token>` and never
accepts a management token. Requests use the Consumer API paths and send
`Cache-Control: no-store`.

## Discover

Select `Discover` to call `GET /api/v1/consumer/credentials`. The node accepts
the `body.data.credentials` response envelope. An optional provider filter is
applied locally, case-insensitively, against `providerKey`,
`metadata.providerKey` and `metadata.displayName`; it does not change the API
request.

The node emits one message per discovered credential and preserves the
authorized public record, including `fields` and additive public projection.
Responses containing secret-like material fail closed. A successful empty
collection emits no messages.

## Resolve

Select `Resolve`, enter an opaque `credentialKey`, and enter comma-separated
secret field names such as `username, region`. The node calls
`POST /api/v1/consumer/credentials/{encoded credentialKey}/resolve` with a
non-empty `secretNames` array. Wildcards and empty names are rejected.

Only canonical responses are accepted: `body.data.secrets` must match the
requested credential key, confirm an active credential with a provider key,
and contain exactly the requested string fields.

The output preserves the original non-secret message context and replaces
`msg.payload` with only the requested fields. Secret values are held only in
the in-flight runtime message required by the flow. The adapter does not log,
cache, persist, URL-encode into paths, or send them to telemetry.

## Outputs and errors

`msg.sekalum.operation` is `discover` or `resolve` and
`msg.sekalum.credentialKey` identifies the selected credential. Discover emits
one message per record; Resolve emits one message for the request.

The adapter preserves server denials and reports stable safe Node-RED errors
for HTTP statuses 400, 401, 403, 429, 500 and network failures. Response
bodies, request bodies and authorization headers are never copied into errors.
A 429 `Retry-After` value may be surfaced as protocol metadata, but Resolve is
never automatically retried.

## Security boundary

Only the Sekalum Consumer API bearer token is supported. Credentials are
declared as a Node-RED password credential and are absent from exported flow
JSON and editor state. Discovery responses containing secret-like fields fail
closed. Resolve output is projected to requested fields and server
authorization remains authoritative. Batch Resolve is outside the initial
scope.

## Example

[`examples/basic-flow.json`](examples/basic-flow.json) contains a minimal
Discover-to-Debug and Resolve-to-Debug flow using only Node-RED core nodes and
the Sekalum nodes. It contains no token or other secret.

## Development and tests

From this directory:

```text
npm install
npm test
npm run pack:check
```

The test suite uses an in-memory local HTTP server and an isolated Node-RED
runtime. It does not require production credentials and does not publish
anything.

## Versioning and releases

The public package follows Semantic Versioning. The released state is
documented in [`CHANGELOG.md`](CHANGELOG.md) and in the corresponding Git tag.
Public npm publication and Node-RED Flow Library submission are separate
release actions.

## License

MIT; see [`LICENSE`](LICENSE).
