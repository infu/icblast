import { decodedCandidLimits } from "./candid_decode_budget.js";

function typeItemLimitError(limit) {
  return new Error(`Candid type table exceeds ${limit} items`);
}

function typeDepthLimitError(limit) {
  return new Error(`Candid type graph exceeds ${limit} depth`);
}

function isWeakMapKey(value) {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function")
  );
}

export function createCandidSchemaTraversal(options = {}) {
  const limits = decodedCandidLimits({
    maxCandidTypeItems: options.maxCandidTypeItems,
    maxCandidTypeDepth: options.maxCandidTypeDepth,
  });
  return {
    depth: 0,
    definitions: [],
    items: 0,
    limits,
    nodes: new WeakMap(),
  };
}

export function withCandidSchemaType(state, type, expand) {
  if (state.items >= state.limits.maxCandidTypeItems) {
    throw typeItemLimitError(state.limits.maxCandidTypeItems);
  }
  state.items++;

  const tracked = isWeakMapKey(type);
  const existing = tracked ? state.nodes.get(type) : undefined;
  if (existing) {
    if (existing.active && !existing.definition) {
      existing.definition = `candidType${state.definitions.length + 1}`;
      state.definitions.push(existing);
    }
    if (existing.definition) {
      return { $ref: `#/$defs/${existing.definition}` };
    }
  }

  if (state.depth >= state.limits.maxCandidTypeDepth) {
    throw typeDepthLimitError(state.limits.maxCandidTypeDepth);
  }

  const schema = {};
  const entry = { active: true, definition: undefined, schema };
  if (tracked) state.nodes.set(type, entry);
  state.depth++;
  let complete = false;
  try {
    const expanded = expand();
    Object.defineProperties(schema, Object.getOwnPropertyDescriptors(expanded));
    complete = true;
    return schema;
  } finally {
    state.depth--;
    entry.active = false;
    if (
      tracked &&
      (!complete || !entry.definition) &&
      state.nodes.get(type) === entry
    ) {
      state.nodes.delete(type);
    }
  }
}

export function finishCandidSchemaTraversal(state, root) {
  if (state.definitions.length === 0) return root;
  const definitions = {};
  for (const entry of state.definitions) {
    const schema = entry.schema === root
      ? Object.defineProperties(
          {},
          Object.getOwnPropertyDescriptors(entry.schema),
        )
      : entry.schema;
    Object.defineProperty(definitions, entry.definition, {
      enumerable: true,
      value: schema,
    });
  }
  Object.defineProperty(root, "$defs", {
    enumerable: true,
    value: definitions,
  });
  return root;
}
