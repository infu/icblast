import * as Agent from "@dfinity/agent";
import { validateCandidMessage } from "./candid_decode_budget.js";
import {
  DEFAULT_CBOR_PREFLIGHT_LIMITS,
  preflightCbor,
} from "./cbor_preflight.js";

export const DEFAULT_MAX_HTTP_RESPONSE_BYTES = 4 * 1024 * 1024;

const REQUEST_STATUS_LABEL = new TextEncoder().encode("request_status");

function positiveSafeInteger(value, fallback, label) {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return limit;
}

function byteView(value, label = "value") {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError(`${label} must be an ArrayBuffer or an ArrayBuffer view`);
}

function bytesEqual(left, right) {
  if (!ArrayBuffer.isView(left) || left.byteLength !== right.byteLength) {
    return false;
  }
  const bytes = byteView(left);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    if (bytes[index] !== right[index]) return false;
  }
  return true;
}

function hasOwn(value, key) {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

function candidateUrl(input, response) {
  if (typeof input === "string" || input instanceof URL) return String(input);
  if (typeof input?.url === "string" && input.url) return input.url;
  if (typeof response?.url === "string" && response.url) return response.url;
  return undefined;
}

function replicaEndpoint(input, response) {
  const candidate = candidateUrl(input, response);
  if (!candidate) return undefined;
  let pathname;
  try {
    pathname = new URL(candidate, "http://icblast.invalid").pathname;
  } catch {
    return undefined;
  }
  if (/^\/api\/v2\/status\/?$/.test(pathname)) return "status";
  const v2 = pathname.match(
    /^\/api\/v2\/canister\/[^/]+\/(query|call|read_state)\/?$/,
  );
  if (v2) return v2[1];
  if (/^\/api\/v3\/canister\/[^/]+\/call\/?$/.test(pathname)) return "call";
  return undefined;
}

function preflightAndDecodeCbor(value, limits, label) {
  const bytes = byteView(value, label);
  preflightCbor(bytes, limits);
  return Agent.Cbor.decode(bytes);
}

function requestIdsFor(endpoint, requestInit) {
  const envelope = preflightAndDecodeCbor(
    requestInit?.body,
    DEFAULT_CBOR_PREFLIGHT_LIMITS,
    `${endpoint} request body`,
  );
  if (!hasOwn(envelope, "content") || envelope.content === null) {
    throw new TypeError(`${endpoint} request body is missing content`);
  }

  if (endpoint === "call") return [Agent.requestIdOf(envelope.content)];

  const requestIds = [];
  for (const path of envelope.content.paths ?? []) {
    if (
      Array.isArray(path) &&
      path.length >= 2 &&
      bytesEqual(path[0], REQUEST_STATUS_LABEL) &&
      ArrayBuffer.isView(path[1])
    ) {
      requestIds.push(byteView(path[1], "read_state request ID"));
    }
  }
  return requestIds;
}

function validateCertifiedReplies(tree, requestIds, candidLimits, validate) {
  let replies = 0;
  for (const requestId of requestIds) {
    const path = ["request_status", requestId];
    const status = Agent.lookupResultToBuffer(
      Agent.lookup_path([...path, "status"], tree),
    );
    if (!status || new TextDecoder().decode(status) !== "replied") continue;
    const reply = Agent.lookupResultToBuffer(
      Agent.lookup_path([...path, "reply"], tree),
    );
    if (reply !== undefined) {
      validate(byteView(reply, "certified Candid reply"), candidLimits);
      replies += 1;
    }
  }
  return replies;
}

function inspectCertificate(
  certificateBytes,
  { candidLimits, cborLimits, requestIds, validate },
) {
  const certificate = preflightAndDecodeCbor(
    certificateBytes,
    cborLimits,
    "certificate",
  );

  // Agent 3.4.3 separately decodes one delegation certificate while verifying
  // the response. Preflight it here before that allocation as well.
  const delegationCertificate = hasOwn(certificate, "delegation") &&
      hasOwn(certificate.delegation, "certificate")
    ? certificate.delegation.certificate
    : undefined;
  if (delegationCertificate !== undefined) {
    preflightAndDecodeCbor(
      delegationCertificate,
      cborLimits,
      "delegation certificate",
    );
  }

  return validateCertifiedReplies(
    hasOwn(certificate, "tree") ? certificate.tree : undefined,
    requestIds,
    candidLimits,
    validate,
  );
}

/**
 * Inspect a materialized fetch response before @dfinity/agent decodes it.
 * Only known IC HTTP API endpoints are parsed; arbitrary fetched resources are
 * still byte-limited by createReplicaResponseGuardFetch but are not decoded.
 */
export function inspectReplicaResponse(
  input,
  response,
  value,
  {
    candidLimits = {},
    cborLimits = DEFAULT_CBOR_PREFLIGHT_LIMITS,
    requestInit,
    validate = validateCandidMessage,
  } = {},
) {
  const endpoint = replicaEndpoint(input, response);
  if (!endpoint || response?.status !== 200) return undefined;

  const bytes = byteView(value, "HTTP response body");
  preflightCbor(bytes, cborLimits);
  if (endpoint === "status") return { endpoint, replies: 0 };

  const decoded = Agent.Cbor.decode(bytes);
  if (endpoint === "query") {
    if (!hasOwn(decoded, "status") || decoded.status !== "replied") {
      return { endpoint, replies: 0 };
    }
    if (!hasOwn(decoded, "reply") || !hasOwn(decoded.reply, "arg")) {
      throw new TypeError("replied query response is missing reply.arg");
    }
    validate(byteView(decoded.reply.arg, "query Candid reply"), candidLimits);
    return { endpoint, replies: 1 };
  }

  if (!hasOwn(decoded, "certificate")) return { endpoint, replies: 0 };
  const requestIds = requestIdsFor(endpoint, requestInit);
  return {
    endpoint,
    replies: inspectCertificate(decoded.certificate, {
      candidLimits,
      cborLimits,
      requestIds,
      validate,
    }),
  };
}

function responseLimitError(limit) {
  return new Error(`HTTP response exceeds ${limit} bytes`);
}

function cancelBody(body, reason) {
  try {
    const cancellation =
      typeof body?.cancel === "function"
        ? body.cancel(reason)
        : body?.destroy?.(reason);
    Promise.resolve(cancellation).catch(() => {});
  } catch {}
}

function responseBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new TypeError("HTTP response body yielded a non-byte chunk");
}

function combineResponseChunks(chunks, byteLength) {
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readBoundedResponse(response, limit) {
  const chunks = [];
  let receivedBytes = 0;
  const accept = (value, cancelTarget) => {
    const chunk = responseBytes(value);
    receivedBytes += chunk.byteLength;
    if (receivedBytes > limit) {
      const error = responseLimitError(limit);
      cancelBody(cancelTarget, error);
      throw error;
    }
    chunks.push(chunk);
  };

  if (typeof response.body?.getReader === "function") {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accept(value, reader);
    }
  } else if (typeof response.body?.[Symbol.asyncIterator] === "function") {
    const iterator = response.body[Symbol.asyncIterator]();
    while (true) {
      const { done, value } = await iterator.next();
      if (done) break;
      accept(value, {
        cancel(reason) {
          cancelBody(response.body, reason);
          return iterator.return?.();
        },
      });
    }
  } else {
    accept(await response.arrayBuffer(), response.body);
  }
  return combineResponseChunks(chunks, receivedBytes);
}

function preserveResponseMetadata(response, source) {
  for (const property of ["redirected", "type", "url"]) {
    Object.defineProperty(response, property, {
      configurable: true,
      value: source[property],
    });
  }
  const clone = response.clone.bind(response);
  Object.defineProperty(response, "clone", {
    configurable: true,
    value: () => preserveResponseMetadata(clone(), source),
  });
  return response;
}

function rebuildResponse(response, bytes) {
  const init = {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  };
  const body = [101, 204, 205, 304].includes(response.status) ? null : bytes;
  for (const ResponseType of [response.constructor, globalThis.Response]) {
    if (typeof ResponseType !== "function" || ResponseType === Object) continue;
    try {
      const rebuilt = new ResponseType(body, init);
      if (
        typeof rebuilt.arrayBuffer === "function" &&
        typeof rebuilt.clone === "function"
      ) {
        return preserveResponseMetadata(rebuilt, response);
      }
    } catch {}
  }
  throw new TypeError("Unable to rebuild the bounded HTTP response");
}

/** Build a fetch function that caps all bodies and inspects IC API CBOR. */
export function createReplicaResponseGuardFetch(
  fetchImplementation,
  {
    maxBytes = DEFAULT_MAX_HTTP_RESPONSE_BYTES,
    candidLimits = {},
    cborLimits = {},
  } = {},
) {
  if (typeof fetchImplementation !== "function") {
    throw new TypeError("A fetch implementation is required");
  }
  const limit = positiveSafeInteger(
    maxBytes,
    DEFAULT_MAX_HTTP_RESPONSE_BYTES,
    "maxHttpResponseBytes",
  );
  const effectiveCborLimits = {
    ...cborLimits,
    maxBytes: cborLimits.maxBytes ?? limit,
  };

  return async function guardedReplicaFetch(input, init) {
    const response = await Reflect.apply(fetchImplementation, this, [input, init]);
    if (response.body === null) return response;
    const declaredBytes = Number(response.headers.get("content-length"));
    if (declaredBytes > limit) {
      const error = responseLimitError(limit);
      cancelBody(response.body, error);
      throw error;
    }
    const bytes = await readBoundedResponse(response, limit);
    inspectReplicaResponse(input, response, bytes, {
      candidLimits,
      cborLimits: effectiveCborLimits,
      requestInit: init,
    });
    return rebuildResponse(response, bytes);
  };
}
