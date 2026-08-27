import { IDL } from "@dfinity/candid";

export const DEFAULT_MAX_DECODED_CANDID_ITEMS = 100_000;
export const DEFAULT_MAX_DECODED_CANDID_DEPTH = 256;

const DEFAULT_MAX_CANDID_MESSAGE_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_CANDID_TYPE_ITEMS = 100_000;
const DEFAULT_MAX_CANDID_LEB_BYTES = 1_024;
const DEFAULT_MAX_CANDID_SLEB_COPY_BYTES = 256 * 1024 * 1024;
const MAX_CONTROL_LEB_BYTES = 10;
const MAX_PRINCIPAL_BYTES = 29;
// A valid wire value can be decoded once speculatively by OptClass and once
// again after that coercion is rolled back. Raw preflight proves the replayed
// wire decoder itself will succeed, so two passes are the conservative bound.
const MAX_VALID_WIRE_DECODE_PASSES = 2;

const TYPE = Object.freeze({
  NULL: -1,
  BOOL: -2,
  NAT: -3,
  INT: -4,
  NAT8: -5,
  NAT16: -6,
  NAT32: -7,
  NAT64: -8,
  INT8: -9,
  INT16: -10,
  INT32: -11,
  INT64: -12,
  FLOAT32: -13,
  FLOAT64: -14,
  TEXT: -15,
  RESERVED: -16,
  EMPTY: -17,
  OPT: -18,
  VEC: -19,
  RECORD: -20,
  VARIANT: -21,
  FUNC: -22,
  SERVICE: -23,
  PRINCIPAL: -24,
});

const PRIMITIVE_TYPES = new Set([
  TYPE.NULL,
  TYPE.BOOL,
  TYPE.NAT,
  TYPE.INT,
  TYPE.NAT8,
  TYPE.NAT16,
  TYPE.NAT32,
  TYPE.NAT64,
  TYPE.INT8,
  TYPE.INT16,
  TYPE.INT32,
  TYPE.INT64,
  TYPE.FLOAT32,
  TYPE.FLOAT64,
  TYPE.TEXT,
  TYPE.RESERVED,
  TYPE.EMPTY,
  TYPE.PRINCIPAL,
]);

const FIXED_WIDTH = new Map([
  [TYPE.NAT8, 1],
  [TYPE.NAT16, 2],
  [TYPE.NAT32, 4],
  [TYPE.NAT64, 8],
  [TYPE.INT8, 1],
  [TYPE.INT16, 2],
  [TYPE.INT32, 4],
  [TYPE.INT64, 8],
  [TYPE.FLOAT32, 4],
  [TYPE.FLOAT64, 8],
]);

function positiveSafeInteger(value, fallback, label) {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return limit;
}

export function decodedCandidLimits({
  maxDecodedCandidItems = DEFAULT_MAX_DECODED_CANDID_ITEMS,
  maxDecodedCandidDepth = DEFAULT_MAX_DECODED_CANDID_DEPTH,
  maxCandidMessageBytes = DEFAULT_MAX_CANDID_MESSAGE_BYTES,
  maxCandidTypeItems = DEFAULT_MAX_CANDID_TYPE_ITEMS,
  maxCandidTypeDepth = maxDecodedCandidDepth,
  maxCandidLebBytes = DEFAULT_MAX_CANDID_LEB_BYTES,
  maxCandidSlebCopyBytes = DEFAULT_MAX_CANDID_SLEB_COPY_BYTES,
} = {}) {
  return {
    maxDecodedCandidItems: positiveSafeInteger(
      maxDecodedCandidItems,
      DEFAULT_MAX_DECODED_CANDID_ITEMS,
      "maxDecodedCandidItems",
    ),
    maxDecodedCandidDepth: positiveSafeInteger(
      maxDecodedCandidDepth,
      DEFAULT_MAX_DECODED_CANDID_DEPTH,
      "maxDecodedCandidDepth",
    ),
    maxCandidMessageBytes: positiveSafeInteger(
      maxCandidMessageBytes,
      DEFAULT_MAX_CANDID_MESSAGE_BYTES,
      "maxCandidMessageBytes",
    ),
    maxCandidTypeItems: positiveSafeInteger(
      maxCandidTypeItems,
      DEFAULT_MAX_CANDID_TYPE_ITEMS,
      "maxCandidTypeItems",
    ),
    maxCandidTypeDepth: positiveSafeInteger(
      maxCandidTypeDepth,
      maxDecodedCandidDepth,
      "maxCandidTypeDepth",
    ),
    maxCandidLebBytes: positiveSafeInteger(
      maxCandidLebBytes,
      DEFAULT_MAX_CANDID_LEB_BYTES,
      "maxCandidLebBytes",
    ),
    maxCandidSlebCopyBytes: positiveSafeInteger(
      maxCandidSlebCopyBytes,
      DEFAULT_MAX_CANDID_SLEB_COPY_BYTES,
      "maxCandidSlebCopyBytes",
    ),
  };
}

function invalid(message) {
  return new Error(`Invalid Candid message: ${message}`);
}

function itemLimitError(limit) {
  return new Error(`Decoded Candid value exceeds ${limit} items`);
}

function depthLimitError(limit) {
  return new Error(`Decoded Candid value exceeds ${limit} depth`);
}

function typeItemLimitError(limit) {
  return new Error(`Candid type table exceeds ${limit} items`);
}

function typeDepthLimitError(limit) {
  return new Error(`Candid type graph exceeds ${limit} depth`);
}

class RuntimeDecodeBudgetError extends Error {}

function runtimeItemLimitError(limit) {
  return new RuntimeDecodeBudgetError(
    `Decoded Candid value exceeds ${limit} items`,
  );
}

function runtimeDepthLimitError(limit) {
  return new RuntimeDecodeBudgetError(
    `Decoded Candid value exceeds ${limit} depth`,
  );
}

function normalizeBytes(value, limit) {
  let view;
  if (value instanceof Uint8Array) {
    view = value;
  } else if (ArrayBuffer.isView(value)) {
    view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  } else if (
    value instanceof ArrayBuffer ||
    (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer)
  ) {
    view = new Uint8Array(value);
  } else if (Array.isArray(value)) {
    if (value.length > limit) {
      throw new Error(`Candid message exceeds ${limit} bytes`);
    }
    view = Uint8Array.from(value);
  } else {
    throw new TypeError("Candid message must be a byte array");
  }
  if (view.byteLength > limit) {
    throw new Error(`Candid message exceeds ${limit} bytes`);
  }
  // @dfinity/candid's Pipe currently ignores a view's byteOffset. The copy also
  // prevents another owner changing bytes between preflight and IDL.decode.
  return Uint8Array.from(view);
}

class Budget {
  constructor(limits, byteLength) {
    this.limits = limits;
    this.byteLength = byteLength;
    this.items = 0;
    this.typeItems = 0;
    this.maxDepth = 0;
    this.typeDepth = 0;
    this.slebCopyBytes = 0;
    this.headerBytes = 0;
  }

  consumeItems(count) {
    if (
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > this.limits.maxDecodedCandidItems - this.items
    ) {
      throw itemLimitError(this.limits.maxDecodedCandidItems);
    }
    this.items += count;
  }

  get remainingItems() {
    return this.limits.maxDecodedCandidItems - this.items;
  }

  observeDepth(depth) {
    if (depth > this.limits.maxDecodedCandidDepth) {
      throw depthLimitError(this.limits.maxDecodedCandidDepth);
    }
    if (depth > this.maxDepth) this.maxDepth = depth;
  }

  consumeTypeItems(count) {
    if (
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > this.limits.maxCandidTypeItems - this.typeItems
    ) {
      throw typeItemLimitError(this.limits.maxCandidTypeItems);
    }
    this.typeItems += count;
  }

  get remainingTypeItems() {
    return this.limits.maxCandidTypeItems - this.typeItems;
  }

  consumeSlebCopy(remainingBytes) {
    if (
      remainingBytes >
      this.limits.maxCandidSlebCopyBytes - this.slebCopyBytes
    ) {
      throw new Error(
        `Candid decode exceeds ${this.limits.maxCandidSlebCopyBytes} signed-LEB work bytes`,
      );
    }
    this.slebCopyBytes += remainingBytes;
  }

  consumeSlebDecode(remainingBytes, lebBytes, negative) {
    // @dfinity/candid's slebDecode copies every unread byte through
    // `pipe.buffer`. Negative values then copy the encoded scalar a second
    // time through `safeRead`. Charge both copies for both possible valid-wire
    // decode passes before handing the message to the stock decoder.
    for (let pass = 0; pass < MAX_VALID_WIRE_DECODE_PASSES; pass++) {
      this.consumeSlebCopy(remainingBytes);
      if (negative) this.consumeSlebCopy(lebBytes);
    }
  }
}

class Cursor {
  constructor(bytes, budget) {
    this.bytes = bytes;
    this.budget = budget;
    this.offset = 0;
  }

  get remaining() {
    return this.bytes.byteLength - this.offset;
  }

  byte(label = "value") {
    if (this.offset >= this.bytes.byteLength) {
      throw invalid(`unexpected end while reading ${label}`);
    }
    return this.bytes[this.offset++];
  }

  take(length, label = "value") {
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > this.remaining
    ) {
      throw invalid(`truncated ${label}`);
    }
    const start = this.offset;
    this.offset += length;
    return this.bytes.subarray(start, this.offset);
  }

  uleb(maximum, label, exceeds = () => invalid(`${label} is out of range`)) {
    const maximumBigInt = BigInt(maximum);
    let value = 0n;
    let shift = 0n;
    for (let count = 0; count < MAX_CONTROL_LEB_BYTES; count++) {
      const byte = this.byte(label);
      value |= BigInt(byte & 0x7f) << shift;
      if (value > maximumBigInt) throw exceeds();
      if ((byte & 0x80) === 0) return Number(value);
      shift += 7n;
    }
    throw invalid(`${label} LEB128 exceeds ${MAX_CONTROL_LEB_BYTES} bytes`);
  }

  sleb(minimum, maximum, label) {
    const initialRemaining = this.remaining;
    let value = 0n;
    let shift = 0n;
    for (let count = 0; count < MAX_CONTROL_LEB_BYTES; count++) {
      const byte = this.byte(label);
      value |= BigInt(byte & 0x7f) << shift;
      shift += 7n;
      if ((byte & 0x80) === 0) {
        const negative = (byte & 0x40) !== 0;
        this.budget.consumeSlebDecode(
          initialRemaining,
          count + 1,
          negative,
        );
        if (negative) value -= 1n << shift;
        if (value < BigInt(minimum) || value > BigInt(maximum)) {
          throw invalid(`${label} is out of range`);
        }
        return Number(value);
      }
    }
    throw invalid(`${label} LEB128 exceeds ${MAX_CONTROL_LEB_BYTES} bytes`);
  }

  scalarLeb(label, signed = false) {
    const initialRemaining = this.remaining;
    for (let count = 0; count < this.budget.limits.maxCandidLebBytes; count++) {
      const byte = this.byte(label);
      if ((byte & 0x80) === 0) {
        if (signed) {
          this.budget.consumeSlebDecode(
            initialRemaining,
            count + 1,
            (byte & 0x40) !== 0,
          );
        }
        return;
      }
    }
    throw new Error(
      `Candid ${label} exceeds ${this.budget.limits.maxCandidLebBytes} LEB128 bytes`,
    );
  }
}

function readTypeRef(cursor, tableLength, label = "type reference") {
  return cursor.sleb(TYPE.PRINCIPAL, Math.max(-1, tableLength - 1), label);
}

function readTypeCount(cursor, budget, label) {
  const count = cursor.uleb(
    budget.remainingTypeItems,
    label,
    () => typeItemLimitError(budget.limits.maxCandidTypeItems),
  );
  budget.consumeTypeItems(count);
  return count;
}

function compareByteStrings(left, right) {
  const sharedLength = Math.min(left.byteLength, right.byteLength);
  for (let index = 0; index < sharedLength; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.byteLength - right.byteLength;
}

function readTypeTable(cursor, budget) {
  const tableLength = readTypeCount(cursor, budget, "type table length");
  const table = new Array(tableLength);

  for (let index = 0; index < tableLength; index++) {
    const opcode = cursor.sleb(TYPE.SERVICE, TYPE.OPT, "type table opcode");
    if (opcode === TYPE.OPT || opcode === TYPE.VEC) {
      const ref = readTypeRef(cursor, tableLength);
      table[index] = {
        kind: opcode === TYPE.OPT ? "opt" : "vec",
        refs: [ref],
      };
      budget.consumeTypeItems(1);
      continue;
    }

    if (opcode === TYPE.RECORD || opcode === TYPE.VARIANT) {
      const fieldCount = readTypeCount(cursor, budget, "field count");
      const fields = new Array(fieldCount);
      let previous = -1;
      for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex++) {
        const id = cursor.uleb(0xffff_ffff, "field id");
        if (id <= previous) {
          throw invalid("field ids must be strictly increasing");
        }
        previous = id;
        fields[fieldIndex] = {
          id,
          ref: readTypeRef(cursor, tableLength),
        };
      }
      table[index] = {
        kind: opcode === TYPE.RECORD ? "record" : "variant",
        fields,
        refs: fields.map((field) => field.ref),
      };
      continue;
    }

    if (opcode === TYPE.FUNC) {
      const argumentCount = readTypeCount(cursor, budget, "function argument count");
      const args = new Array(argumentCount);
      for (let argument = 0; argument < argumentCount; argument++) {
        args[argument] = readTypeRef(cursor, tableLength);
      }
      const resultCount = readTypeCount(cursor, budget, "function result count");
      const results = new Array(resultCount);
      for (let result = 0; result < resultCount; result++) {
        results[result] = readTypeRef(cursor, tableLength);
      }
      const annotationCount = cursor.byte("function annotation count");
      if (annotationCount > 1) {
        throw invalid("function annotation count exceeds 1");
      }
      budget.consumeTypeItems(annotationCount);
      const annotations = new Array(annotationCount);
      for (let annotation = 0; annotation < annotationCount; annotation++) {
        annotations[annotation] = cursor.byte("function annotation");
        if (
          annotations[annotation] !== 1 &&
          annotations[annotation] !== 2 &&
          annotations[annotation] !== 3
        ) {
          throw invalid("unknown function annotation");
        }
      }
      if (annotations[0] === 2 && results.length !== 0) {
        throw invalid("oneway function must not have result types");
      }
      table[index] = {
        kind: "func",
        args,
        results,
        annotations,
        refs: [...args, ...results],
      };
      continue;
    }

    if (opcode === TYPE.SERVICE) {
      const methodCount = readTypeCount(cursor, budget, "service method count");
      const methods = new Array(methodCount);
      let previousName;
      for (let method = 0; method < methodCount; method++) {
        const nameLength = cursor.uleb(cursor.remaining, "service method name length");
        const name = cursor.take(nameLength, "service method name");
        validateUtf8(name, "service method name");
        if (
          previousName !== undefined &&
          compareByteStrings(previousName, name) >= 0
        ) {
          throw invalid("service method names must be strictly increasing");
        }
        previousName = name;
        methods[method] = readTypeRef(cursor, tableLength, "service method type");
      }
      table[index] = { kind: "service", methods, refs: methods };
      continue;
    }

    throw invalid(`unsupported type table opcode ${opcode}`);
  }

  const rootCount = readTypeCount(cursor, budget, "top-level type count");
  const roots = new Array(rootCount);
  for (let root = 0; root < rootCount; root++) {
    roots[root] = readTypeRef(cursor, tableLength, "top-level type");
  }
  return { table, roots };
}

function validateTypeRef(ref, tableLength) {
  if (ref >= 0) {
    if (ref >= tableLength) throw invalid("type index out of range");
    return;
  }
  if (!PRIMITIVE_TYPES.has(ref)) {
    throw invalid(`illegal primitive type reference ${ref}`);
  }
}

function validateTypeTable(table, roots, budget) {
  for (const node of table) {
    for (const ref of node.refs) validateTypeRef(ref, table.length);
    if (node.kind === "service") {
      for (const ref of node.methods) {
        if (ref < 0 || table[ref].kind !== "func") {
          throw invalid("service methods must reference function types");
        }
      }
    }
  }
  for (const ref of roots) validateTypeRef(ref, table.length);
  budget.typeDepth = graphDepth(
    table.map((node) => node.refs.filter((ref) => ref >= 0)),
    budget.limits.maxCandidTypeDepth,
  );
}

// Collapse cycles before calculating depth. Recursive Candid types are valid,
// but a long acyclic type chain (or a very large recursive knot) can overflow
// @dfinity/candid's recursive subtype/name logic before value decoding starts.
function graphDepth(adjacency, maxDepth) {
  const count = adjacency.length;
  if (count === 0) return 0;

  const reverse = Array.from({ length: count }, () => []);
  for (let from = 0; from < count; from++) {
    for (const to of adjacency[from]) reverse[to].push(from);
  }

  const seen = new Uint8Array(count);
  const order = [];
  for (let start = 0; start < count; start++) {
    if (seen[start]) continue;
    seen[start] = 1;
    const stack = [{ node: start, next: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame.next < adjacency[frame.node].length) {
        const child = adjacency[frame.node][frame.next++];
        if (!seen[child]) {
          seen[child] = 1;
          stack.push({ node: child, next: 0 });
        }
      } else {
        order.push(frame.node);
        stack.pop();
      }
    }
  }

  const component = new Int32Array(count);
  component.fill(-1);
  const componentSizes = [];
  for (let position = order.length - 1; position >= 0; position--) {
    const start = order[position];
    if (component[start] !== -1) continue;
    const componentIndex = componentSizes.length;
    let size = 0;
    const stack = [start];
    component[start] = componentIndex;
    while (stack.length > 0) {
      const node = stack.pop();
      size++;
      for (const parent of reverse[node]) {
        if (component[parent] === -1) {
          component[parent] = componentIndex;
          stack.push(parent);
        }
      }
    }
    if (size > maxDepth) throw typeDepthLimitError(maxDepth);
    componentSizes.push(size);
  }

  const componentEdges = Array.from(
    { length: componentSizes.length },
    () => [],
  );
  const indegree = new Uint32Array(componentSizes.length);
  for (let from = 0; from < count; from++) {
    const fromComponent = component[from];
    for (const to of adjacency[from]) {
      const toComponent = component[to];
      if (fromComponent !== toComponent) {
        componentEdges[fromComponent].push(toComponent);
        indegree[toComponent]++;
      }
    }
  }

  const queue = [];
  const depth = componentSizes.slice();
  for (let index = 0; index < indegree.length; index++) {
    if (indegree[index] === 0) queue.push(index);
  }
  let maximum = 0;
  for (let head = 0; head < queue.length; head++) {
    const from = queue[head];
    if (depth[from] > maxDepth) throw typeDepthLimitError(maxDepth);
    maximum = Math.max(maximum, depth[from]);
    for (const to of componentEdges[from]) {
      depth[to] = Math.max(depth[to], depth[from] + componentSizes[to]);
      indegree[to]--;
      if (indegree[to] === 0) queue.push(to);
    }
  }
  if (depth.some((value) => value > maxDepth)) {
    throw typeDepthLimitError(maxDepth);
  }
  return maximum;
}

function visitCandidTypeChildren(type, visit, consumeExtra) {
  if (type instanceof IDL.RecClass) {
    const child = type.getType();
    if (child === undefined) {
      throw new TypeError("Uninitialized expected Candid recursive type");
    }
    visit(child);
    return;
  }
  if (type instanceof IDL.VecClass || type instanceof IDL.OptClass) {
    visit(type._type);
    return;
  }
  if (type instanceof IDL.FuncClass) {
    if (!Array.isArray(type.argTypes) || !Array.isArray(type.retTypes)) {
      throw new TypeError("Invalid expected Candid function type");
    }
    if (!Array.isArray(type.annotations)) {
      throw new TypeError("Invalid expected Candid function annotations");
    }
    if (type.annotations.length > 1) {
      throw new TypeError(
        "Expected Candid function must have at most one annotation",
      );
    }
    consumeExtra(type.annotations.length);
    for (const annotation of type.annotations) {
      if (
        annotation !== "query" &&
        annotation !== "oneway" &&
        annotation !== "composite_query"
      ) {
        throw new TypeError("Invalid expected Candid function annotation");
      }
    }
    if (type.annotations[0] === "oneway" && type.retTypes.length !== 0) {
      throw new TypeError(
        "Expected oneway Candid function must not have result types",
      );
    }
    for (const child of type.argTypes) visit(child);
    for (const child of type.retTypes) visit(child);
    return;
  }
  if (type instanceof IDL.ServiceClass) {
    for (const [, child] of type._fields) {
      if (!(child instanceof IDL.FuncClass)) {
        throw new TypeError("Expected Candid service fields must be functions");
      }
      visit(child);
    }
    return;
  }
  if (type instanceof IDL.RecordClass || type instanceof IDL.VariantClass) {
    for (const [, child] of type._fields) visit(child);
    return;
  }
  if (type instanceof IDL.PrimitiveType || type instanceof IDL.UnknownClass) {
    return;
  }
  throw new TypeError("Unsupported expected Candid type");
}

// Estimate repeated structural `.name` expansion. The stock subtype cache keys
// relations by recursively rendered names, so a small shared DAG can otherwise
// expand exponentially. RecClass.name is constant and deliberately stops a
// name path; its target is still seeded independently because subtype unfolds it.
function expandedGraphItems(adjacency, maxItems, maxDepth) {
  const indegree = new Uint32Array(adjacency.length);
  for (const edges of adjacency) {
    for (const child of edges) indegree[child]++;
  }
  const queue = [];
  const occurrences = new Array(adjacency.length).fill(1);
  for (let index = 0; index < indegree.length; index++) {
    if (indegree[index] === 0) queue.push(index);
  }
  let processed = 0;
  let total = 0;
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    processed++;
    if (occurrences[node] > maxItems - total) {
      throw typeItemLimitError(maxItems);
    }
    total += occurrences[node];
    for (const child of adjacency[node]) {
      occurrences[child] =
        occurrences[child] > maxItems - occurrences[node]
          ? Number.POSITIVE_INFINITY
          : occurrences[child] + occurrences[node];
      indegree[child]--;
      if (indegree[child] === 0) queue.push(child);
    }
  }
  if (processed !== adjacency.length) {
    // Generated recursive types use RecClass. A direct object cycle would make
    // the dependency's name getter recurse forever and is never safe to pass on.
    throw typeDepthLimitError(maxDepth);
  }

  // Work attributable to one decode of each expected type. Service and
  // function subtyping renders recursive `.name` strings even on cache hits;
  // retaining per-node weights lets the runtime meter a reused service value
  // on every occurrence instead of charging its graph only once at startup.
  const nodeItems = new Array(adjacency.length).fill(1);
  for (let position = queue.length - 1; position >= 0; position--) {
    const node = queue[position];
    for (const child of adjacency[node]) {
      if (nodeItems[child] > maxItems - nodeItems[node]) {
        throw typeItemLimitError(maxItems);
      }
      nodeItems[node] += nodeItems[child];
    }
  }
  return { nodeItems, total };
}

/**
 * Iteratively validate the trusted-side IDL graph produced by an idlFactory.
 * Run this once before constructing an Actor or exposing raw decode helpers.
 */
export function preflightCandidService(service, options = {}) {
  const limits = decodedCandidLimits(options);
  if (!(service instanceof IDL.ServiceClass)) {
    throw new TypeError("Expected an @dfinity/candid ServiceClass");
  }

  const nodes = [];
  const adjacency = [];
  const nameAdjacency = [];
  const indexes = new WeakMap();
  let typeItems = 0;
  let typeEdges = 0;
  const consume = (count) => {
    if (count > limits.maxCandidTypeItems - typeItems) {
      throw typeItemLimitError(limits.maxCandidTypeItems);
    }
    typeItems += count;
  };
  const addNode = (type) => {
    if (type === null || typeof type !== "object") {
      throw new TypeError("Invalid expected Candid type");
    }
    const existing = indexes.get(type);
    if (existing !== undefined) return existing;
    consume(1);
    const index = nodes.length;
    indexes.set(type, index);
    nodes.push(type);
    adjacency.push([]);
    nameAdjacency.push([]);
    return index;
  };

  addNode(service);
  for (let index = 0; index < nodes.length; index++) {
    const type = nodes[index];
    const nameExpandsChild = !(type instanceof IDL.RecClass);
    visitCandidTypeChildren(
      type,
      (child) => {
        consume(1);
        typeEdges++;
        const childIndex = addNode(child);
        adjacency[index].push(childIndex);
        if (nameExpandsChild) nameAdjacency[index].push(childIndex);
      },
      consume,
    );
  }

  const typeDepth = graphDepth(adjacency, limits.maxCandidTypeDepth);
  const expanded = expandedGraphItems(
    nameAdjacency,
    limits.maxCandidTypeItems,
    limits.maxCandidTypeDepth,
  );
  const result = {
    service,
    typeItems,
    typeNodes: nodes.length,
    typeEdges,
    typeDepth,
    expandedTypeItems: expanded.total,
  };
  Object.defineProperty(result, SERVICE_PREFLIGHT_INTERNAL, {
    value: {
      expandedNodeItems: expanded.nodeItems,
      limits,
      nodes,
    },
  });
  return result;
}

const SERVICE_PREFLIGHT_INTERNAL = Symbol("candidServicePreflight");

const RUNTIME_DECODE_STATES = new WeakMap();
const RUNTIME_WIRE_NAME_ITEMS = new WeakMap();

function runtimeWireNameItems(root, limits) {
  let cachedByLimits = RUNTIME_WIRE_NAME_ITEMS.get(root);
  if (cachedByLimits === undefined) {
    cachedByLimits = new Map();
    RUNTIME_WIRE_NAME_ITEMS.set(root, cachedByLimits);
  }
  const limitsKey = `${limits.maxCandidTypeItems}:${limits.maxCandidTypeDepth}`;
  const cached = cachedByLimits.get(limitsKey);
  if (cached !== undefined) return cached;

  const nodes = [];
  const adjacency = [];
  const nameAdjacency = [];
  const indexes = new WeakMap();
  let typeItems = 0;
  const consume = (count) => {
    if (
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > limits.maxCandidTypeItems - typeItems
    ) {
      throw typeItemLimitError(limits.maxCandidTypeItems);
    }
    typeItems += count;
  };
  const addNode = (type) => {
    if (type === null || typeof type !== "object") {
      throw new TypeError("Invalid wire Candid type");
    }
    const existing = indexes.get(type);
    if (existing !== undefined) return existing;
    consume(1);
    const index = nodes.length;
    indexes.set(type, index);
    nodes.push(type);
    adjacency.push([]);
    nameAdjacency.push([]);
    return index;
  };

  addNode(root);
  for (let index = 0; index < nodes.length; index++) {
    const type = nodes[index];
    const nameExpandsChild = !(type instanceof IDL.RecClass);
    visitCandidTypeChildren(
      type,
      (child) => {
        consume(1);
        const childIndex = addNode(child);
        adjacency[index].push(childIndex);
        if (nameExpandsChild) nameAdjacency[index].push(childIndex);
      },
      consume,
    );
  }
  graphDepth(adjacency, limits.maxCandidTypeDepth);
  const expanded = expandedGraphItems(
    nameAdjacency,
    limits.maxCandidTypeItems,
    limits.maxCandidTypeDepth,
  );
  const result = expanded.nodeItems[0];
  cachedByLimits.set(limitsKey, result);
  return result;
}

function runtimeDecodeState(pipe, token) {
  if ((typeof pipe !== "object" && typeof pipe !== "function") || pipe === null) {
    throw new TypeError("Invalid Candid decode pipe");
  }
  let states = RUNTIME_DECODE_STATES.get(pipe);
  if (states === undefined) {
    states = new Map();
    RUNTIME_DECODE_STATES.set(pipe, states);
  }
  let state = states.get(token);
  if (state === undefined) {
    state = {
      depth: 0,
      failure: undefined,
      items: 0,
      subtypePairs: new WeakMap(),
      subtypeRelations: 0,
    };
    states.set(token, state);
  }
  return state;
}

function failRuntimeDecode(state, error) {
  if (state.failure === undefined) state.failure = error;
  throw state.failure;
}

function consumeRuntimeItems(state, limits, count) {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > limits.maxDecodedCandidItems - state.items
  ) {
    failRuntimeDecode(
      state,
      runtimeItemLimitError(limits.maxDecodedCandidItems),
    );
  }
  state.items += count;
}

function consumeSubtypeCacheCopy(state, limits, expected, wire) {
  let wireTypes = state.subtypePairs.get(expected);
  if (wireTypes === undefined) {
    wireTypes = new WeakSet();
    state.subtypePairs.set(expected, wireTypes);
  }
  if (!wireTypes.has(wire)) {
    wireTypes.add(wire);
    state.subtypeRelations++;
  }
  // Stock subtype() copies every relation retained by this IDL.decode before
  // even checking whether the current pair is cached.
  consumeRuntimeItems(state, limits, state.subtypeRelations);
}

function peekVectorLength(pipe) {
  if (typeof pipe?.save !== "function") {
    throw new TypeError("Invalid Candid decode pipe");
  }
  const bytes = pipe.save();
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("Invalid Candid decode checkpoint");
  }
  let value = 0n;
  let shift = 0n;
  for (let index = 0; index < MAX_CONTROL_LEB_BYTES; index++) {
    if (index >= bytes.byteLength) {
      throw invalid("unexpected end while reading vector length");
    }
    const byte = bytes[index];
    value |= BigInt(byte & 0x7f) << shift;
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw itemLimitError(Number.MAX_SAFE_INTEGER);
    }
    if ((byte & 0x80) === 0) return Number(value);
    shift += 7n;
  }
  throw invalid(
    `vector length LEB128 exceeds ${MAX_CONTROL_LEB_BYTES} bytes`,
  );
}

function readPipeByte(pipe) {
  const value = pipe.readUint8();
  if (value === undefined) throw new Error("unexpected end of buffer");
  return value;
}

// This is the stock OptClass decode algorithm with one deliberate distinction:
// our private budget exception is never treated as a subtype mismatch. Without
// that distinction each enclosing option would catch the limit, replay the
// wire value, and only then let an outer wrapper notice the latched failure.
function decodeBoundedOption(pipe, wire) {
  if (wire instanceof IDL.NullClass || wire instanceof IDL.ReservedClass) {
    return [];
  }
  let wireType = wire;
  if (wire instanceof IDL.RecClass) {
    const resolved = wire.getType();
    if (resolved === undefined) {
      throw new Error("type mismatch with uninitialized type");
    }
    wireType = resolved;
  }
  if (wireType instanceof IDL.OptClass) {
    switch (readPipeByte(pipe)) {
      case 0:
        return [];
      case 1: {
        const checkpoint = pipe.save();
        try {
          return [this._type.decodeValue(pipe, wireType._type)];
        } catch (error) {
          if (error instanceof RuntimeDecodeBudgetError) throw error;
          pipe.restore(checkpoint);
          wireType._type.decodeValue(pipe, wireType._type);
          return [];
        }
      }
      default:
        throw new Error("Not an option value");
    }
  }
  if (
    this._type instanceof IDL.NullClass ||
    this._type instanceof IDL.OptClass ||
    this._type instanceof IDL.ReservedClass
  ) {
    wireType.decodeValue(pipe, wireType);
    return [];
  }
  const checkpoint = pipe.save();
  try {
    return [this._type.decodeValue(pipe, wire)];
  } catch (error) {
    if (error instanceof RuntimeDecodeBudgetError) throw error;
    pipe.restore(checkpoint);
    wireType.decodeValue(pipe, wire);
    return [];
  }
}

function instrumentExpectedDecode(type, limits, nameItems, token) {
  const originalDecode =
    type instanceof IDL.OptClass ? decodeBoundedOption : type.decodeValue;
  const checksSubtype =
    type instanceof IDL.ServiceClass || type instanceof IDL.FuncClass;
  let staticItems = 1;
  if (type instanceof IDL.RecClass) {
    staticItems = 0;
  } else if (checksSubtype) {
    // subtype() renders the complete structural name even on relation-cache
    // hits, so this work repeats for every returned service/function value.
    staticItems = nameItems;
  } else if (
    (type instanceof IDL.RecordClass && !Array.isArray(type._components)) ||
    type instanceof IDL.VariantClass
  ) {
    // Record decoding walks every expected field and creates omitted optional
    // values. Variant decoding linearly searches every expected alternative.
    // Both costs repeat for every returned instance.
    staticItems += type._fields.length;
  }
  const fixedVector =
    type instanceof IDL.VecClass &&
    (type._type instanceof IDL.FixedNatClass ||
      type._type instanceof IDL.FixedIntClass);

  Object.defineProperty(type, "decodeValue", {
    configurable: false,
    enumerable: false,
    value(pipe, wireType) {
      const state = runtimeDecodeState(pipe, token);
      if (state.failure !== undefined) throw state.failure;
      state.depth++;
      try {
        if (state.depth > limits.maxDecodedCandidDepth) {
          failRuntimeDecode(
            state,
            runtimeDepthLimitError(limits.maxDecodedCandidDepth),
          );
        }
        consumeRuntimeItems(state, limits, staticItems);
        if (checksSubtype) {
          const resolvedWire = wireType instanceof IDL.RecClass
            ? wireType.getType()
            : wireType;
          if (resolvedWire === undefined) {
            throw new Error("type mismatch with uninitialized type");
          }
          consumeSubtypeCacheCopy(state, limits, this, resolvedWire);
          let wireNameItems;
          try {
            wireNameItems = runtimeWireNameItems(resolvedWire, limits);
          } catch (error) {
            failRuntimeDecode(
              state,
              new RuntimeDecodeBudgetError(
                error instanceof Error ? error.message : String(error),
              ),
            );
          }
          consumeRuntimeItems(
            state,
            limits,
            wireNameItems,
          );
        }
        if (fixedVector) {
          consumeRuntimeItems(state, limits, peekVectorLength(pipe));
        }
        const result = originalDecode.call(this, pipe, wireType);
        if (state.failure !== undefined) throw state.failure;
        return result;
      } catch (error) {
        if (state.failure !== undefined) throw state.failure;
        throw error;
      } finally {
        state.depth--;
      }
    },
    writable: false,
  });
}

function defineExpectedField(fields, name, type) {
  Object.defineProperty(fields, name, {
    configurable: true,
    enumerable: true,
    value: type,
    writable: true,
  });
}

function cloneExpectedType(type, clones) {
  const existing = clones.get(type);
  if (existing !== undefined) return existing;

  let cloned;
  if (type instanceof IDL.RecClass) {
    cloned = IDL.Rec();
    clones.set(type, cloned);
    const child = type.getType();
    if (child === undefined) {
      throw new TypeError("Uninitialized expected Candid recursive type");
    }
    cloned.fill(cloneExpectedType(child, clones));
    return cloned;
  }
  if (type instanceof IDL.FixedNatClass) {
    cloned = new IDL.FixedNatClass(type._bits);
  } else if (type instanceof IDL.FixedIntClass) {
    cloned = new IDL.FixedIntClass(type._bits);
  } else if (type instanceof IDL.FloatClass) {
    cloned = new IDL.FloatClass(type._bits);
  } else if (type instanceof IDL.BoolClass) {
    cloned = new IDL.BoolClass();
  } else if (type instanceof IDL.EmptyClass) {
    cloned = new IDL.EmptyClass();
  } else if (type instanceof IDL.IntClass) {
    cloned = new IDL.IntClass();
  } else if (type instanceof IDL.NatClass) {
    cloned = new IDL.NatClass();
  } else if (type instanceof IDL.NullClass) {
    cloned = new IDL.NullClass();
  } else if (type instanceof IDL.PrincipalClass) {
    cloned = new IDL.PrincipalClass();
  } else if (type instanceof IDL.ReservedClass) {
    cloned = new IDL.ReservedClass();
  } else if (type instanceof IDL.TextClass) {
    cloned = new IDL.TextClass();
  } else if (type instanceof IDL.UnknownClass) {
    cloned = new IDL.UnknownClass();
  } else if (type instanceof IDL.VecClass) {
    cloned = IDL.Vec(cloneExpectedType(type._type, clones));
  } else if (type instanceof IDL.OptClass) {
    cloned = IDL.Opt(cloneExpectedType(type._type, clones));
  } else if (
    type instanceof IDL.RecordClass &&
    Array.isArray(type._components)
  ) {
    cloned = IDL.Tuple(
      ...type._components.map((child) => cloneExpectedType(child, clones)),
    );
  } else if (
    type instanceof IDL.RecordClass ||
    type instanceof IDL.VariantClass
  ) {
    const fields = Object.create(null);
    for (const [name, child] of type._fields) {
      defineExpectedField(fields, name, cloneExpectedType(child, clones));
    }
    cloned = type instanceof IDL.RecordClass
      ? IDL.Record(fields)
      : IDL.Variant(fields);
  } else if (type instanceof IDL.FuncClass) {
    cloned = IDL.Func(
      type.argTypes.map((child) => cloneExpectedType(child, clones)),
      type.retTypes.map((child) => cloneExpectedType(child, clones)),
      [...type.annotations],
    );
  } else if (type instanceof IDL.ServiceClass) {
    const methods = Object.create(null);
    for (const [name, child] of type._fields) {
      defineExpectedField(methods, name, cloneExpectedType(child, clones));
    }
    cloned = IDL.Service(methods);
  } else {
    throw new TypeError("Unsupported expected Candid type");
  }
  clones.set(type, cloned);
  return cloned;
}

/**
 * Return a detached, semantically equivalent service whose stock Candid
 * decoder is metered for every returned value instance. Detaching is required
 * because primitive IDL objects are dependency-wide singletons and cannot
 * safely hold limits belonging to one ICBlast client.
 */
export function validateCandidService(service, options = {}) {
  const preflight = preflightCandidService(service, options);
  const internal = preflight[SERVICE_PREFLIGHT_INTERNAL];
  const clones = new WeakMap();
  const boundedService = cloneExpectedType(service, clones);
  const token = Object.freeze({});
  for (let index = 0; index < internal.nodes.length; index++) {
    instrumentExpectedDecode(
      clones.get(internal.nodes[index]),
      internal.limits,
      internal.expandedNodeItems[index],
      token,
    );
  }
  return boundedService;
}

function fixedWidth(ref) {
  return ref < 0 ? FIXED_WIDTH.get(ref) : undefined;
}

function validateUtf8(bytes, label) {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw invalid(`${label} is not valid UTF-8`);
  }
}

function scanPrincipal(cursor) {
  if (cursor.byte("principal marker") !== 1) {
    throw invalid("principal marker must be 1");
  }
  const length = cursor.uleb(MAX_PRINCIPAL_BYTES, "principal length");
  cursor.take(length, "principal");
}

function scanValues(cursor, table, roots, budget) {
  budget.consumeItems(roots.length);
  const stack = [{ kind: "sequence", refs: roots, next: 0, depth: 1 }];

  const scheduleChildren = (refs, depth) => {
    if (refs.length === 0) return;
    budget.observeDepth(depth);
    budget.consumeItems(refs.length);
    stack.push({ kind: "sequence", refs, next: 0, depth });
  };

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame.kind === "sequence") {
      if (frame.next >= frame.refs.length) continue;
      const ref = frame.refs[frame.next++];
      stack.push(frame);
      stack.push({ kind: "value", ref, depth: frame.depth });
      continue;
    }
    if (frame.kind === "repeat") {
      if (frame.remaining === 0) continue;
      frame.remaining--;
      stack.push(frame);
      stack.push({ kind: "value", ref: frame.ref, depth: frame.depth });
      continue;
    }

    budget.observeDepth(frame.depth);
    const ref = frame.ref;
    if (ref < 0) {
      switch (ref) {
        case TYPE.NULL:
        case TYPE.RESERVED:
          continue;
        case TYPE.EMPTY:
          throw invalid("empty cannot appear as a value");
        case TYPE.BOOL: {
          const value = cursor.byte("bool");
          if (value !== 0 && value !== 1) throw invalid("bool is out of range");
          continue;
        }
        case TYPE.NAT:
          cursor.scalarLeb("nat");
          continue;
        case TYPE.INT:
          cursor.scalarLeb("int", true);
          continue;
        case TYPE.TEXT: {
          const length = cursor.uleb(cursor.remaining, "text length");
          validateUtf8(cursor.take(length, "text"), "text");
          continue;
        }
        case TYPE.PRINCIPAL:
          scanPrincipal(cursor);
          continue;
        default: {
          const width = FIXED_WIDTH.get(ref);
          if (width === undefined) throw invalid(`unsupported primitive ${ref}`);
          cursor.take(width, "fixed-width value");
          continue;
        }
      }
    }

    const node = table[ref];
    switch (node.kind) {
      case "opt": {
        const tag = cursor.byte("option tag");
        if (tag === 0) break;
        if (tag !== 1) throw invalid("option tag must be 0 or 1");
        scheduleChildren(node.refs, frame.depth + 1);
        break;
      }
      case "vec": {
        const child = node.refs[0];
        const width = fixedWidth(child);
        const length = cursor.uleb(
          budget.remainingItems,
          "vector length",
          () => itemLimitError(budget.limits.maxDecodedCandidItems),
        );
        budget.consumeItems(length);
        if (length === 0) break;
        const childDepth = frame.depth + 1;
        budget.observeDepth(childDepth);
        if (width !== undefined) {
          if (length > Math.floor(cursor.remaining / width)) {
            throw invalid("truncated fixed-width vector");
          }
          cursor.take(length * width, "fixed-width vector");
        } else if (child === TYPE.NULL || child === TYPE.RESERVED) {
          // Every logical item was charged above; these elements consume no bytes.
        } else if (child === TYPE.EMPTY) {
          throw invalid("empty cannot appear as a vector element");
        } else {
          stack.push({
            kind: "repeat",
            ref: child,
            remaining: length,
            depth: childDepth,
          });
        }
        break;
      }
      case "record":
        scheduleChildren(node.refs, frame.depth + 1);
        break;
      case "variant": {
        if (node.fields.length === 0) {
          throw invalid("variant has no alternatives");
        }
        const alternative = cursor.uleb(
          node.fields.length - 1,
          "variant index",
        );
        scheduleChildren([node.fields[alternative].ref], frame.depth + 1);
        break;
      }
      case "func": {
        if (cursor.byte("function marker") !== 1) {
          throw invalid("function marker must be 1");
        }
        scanPrincipal(cursor);
        const methodLength = cursor.uleb(cursor.remaining, "function method length");
        validateUtf8(
          cursor.take(methodLength, "function method"),
          "function method",
        );
        break;
      }
      case "service":
        scanPrincipal(cursor);
        break;
      default:
        throw invalid(`unsupported type ${node.kind}`);
    }
  }
}

function scanCandidMessage(bytes, limits) {
  const normalized = normalizeBytes(bytes, limits.maxCandidMessageBytes);
  const budget = new Budget(limits, normalized.byteLength);
  const cursor = new Cursor(normalized, budget);
  const magic = cursor.take(4, "magic");
  if (
    magic[0] !== 0x44 ||
    magic[1] !== 0x49 ||
    magic[2] !== 0x44 ||
    magic[3] !== 0x4c
  ) {
    throw invalid("wrong magic number");
  }

  const { table, roots } = readTypeTable(cursor, budget);
  budget.headerBytes = cursor.offset;
  validateTypeTable(table, roots, budget);
  scanValues(cursor, table, roots, budget);
  if (cursor.remaining !== 0) throw invalid("left-over bytes");
  return {
    bytes: normalized,
    byteLength: normalized.byteLength,
    decodedItems: budget.items,
    maxDepth: budget.maxDepth,
    typeItems: budget.typeItems,
    typeDepth: budget.typeDepth,
    headerBytes: budget.headerBytes,
    slebCopyBytes: budget.slebCopyBytes,
  };
}

/**
 * Parse and structurally budget an entire raw DIDL message.
 *
 * The returned `bytes` is the zero-offset defensive copy that must be passed
 * to IDL.decode. Every top-level wire value is scanned, including values that
 * the caller's expected return list would cause @dfinity/candid to discard.
 */
export function preflightCandid(bytes, options = {}) {
  return scanCandidMessage(bytes, decodedCandidLimits(options));
}

/** Compatibility helper for decode hooks that only need normalized bytes. */
export function validateCandidMessage(bytes, options = {}) {
  return preflightCandid(bytes, options).bytes;
}

/** Decode only after the complete wire message passes the structural budget. */
export function decodeCandidWithBudget(expectedTypes, bytes, options = {}) {
  return IDL.decode(expectedTypes, validateCandidMessage(bytes, options));
}
