import { IDL } from "@dfinity/candid";

const PREPARED_CALL_USED = "Prepared call has already been invoked";

function freezeJsonValue(value, path) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} is not JSON-compatible`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      freezeJsonValue(value[index], `${path}[${index}]`);
    }
    return Object.freeze(value);
  }
  if (value !== null && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} is not JSON-compatible`);
    }
    for (const key of Object.keys(value)) {
      freezeJsonValue(value[key], `${path}.${key}`);
    }
    return Object.freeze(value);
  }
  throw new TypeError(`${path} is not JSON-compatible`);
}

export function deepFreezeJson(value) {
  return freezeJsonValue(value, "args");
}

export function attachPreparedCall(
  method,
  { argTypes, convertArgs, projectArgs, dispatch },
) {
  async function prepare(...args) {
    const converted = await convertArgs(args);
    const encoded = IDL.encode(argTypes, converted);
    const candidArgs = IDL.decode(argTypes, encoded);
    const publicArgs = deepFreezeJson(projectArgs(candidArgs));
    if (!Array.isArray(publicArgs)) {
      throw new TypeError("Prepared call arguments must be a JSON array");
    }

    let used = false;
    function invoke() {
      if (arguments.length !== 0) {
        throw new TypeError("Prepared call invoke does not accept arguments");
      }
      if (used) throw new Error(PREPARED_CALL_USED);
      used = true;
      return dispatch(candidArgs);
    }

    return Object.freeze({ args: publicArgs, invoke });
  }

  Object.defineProperty(method, "prepare", { value: prepare });
  return method;
}

