export const CANDID_PROTO_FIELD = "__proto__";
// The Candid numeric label with the same idlLabelToId hash as `__proto__`.
export const CANDID_PROTO_FIELD_ALIAS = "_2111641832_";

export function hasOwn(value, key) {
  return (
    value !== null &&
    value !== undefined &&
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

export function defineDataProperty(target, key, value) {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
  return target;
}

export function defineCandidSchemaProperty(schema, key, value) {
  if (key === CANDID_PROTO_FIELD) {
    if (!schema.patternProperties) {
      defineDataProperty(schema, "patternProperties", {});
    }
    defineDataProperty(schema.patternProperties, "^__proto__$", value);
  } else {
    if (!schema.properties) defineDataProperty(schema, "properties", {});
    defineDataProperty(schema.properties, key, value);
  }
}

export function decodedRecordKey(value, key) {
  if (hasOwn(value, key)) return key;
  if (
    key === CANDID_PROTO_FIELD &&
    hasOwn(value, CANDID_PROTO_FIELD_ALIAS)
  ) {
    return CANDID_PROTO_FIELD_ALIAS;
  }
  return undefined;
}

export function candidActorMethod(actor, key) {
  if (hasOwn(actor, key)) return actor[key];
  if (key === CANDID_PROTO_FIELD) {
    const prototype = Object.getPrototypeOf(actor);
    if (typeof prototype === "function") return prototype;
  }
  return undefined;
}

export function candidVariantKey(value, alternatives) {
  const keys = Object.keys(value);
  if (keys.length !== 1) throw "(variant expected)";
  const [key] = keys;
  if (!hasOwn(alternatives, key)) throw `(${key} is not a variant field)`;
  return key;
}

export function withSafeCandidRecordFields(idlFactory) {
  return ({ IDL }) => {
    const safeIDL = Object.create(IDL);
    defineDataProperty(safeIDL, "Record", (fields = {}) => {
      const safeFields = {};
      for (const [key, type] of Object.entries(fields)) {
        defineDataProperty(
          safeFields,
          key === CANDID_PROTO_FIELD ? CANDID_PROTO_FIELD_ALIAS : key,
          type,
        );
      }
      return IDL.Record(safeFields);
    });
    return idlFactory({ IDL: safeIDL });
  };
}
