import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";

export class xBase {
  constructor(obj) {
    this.val = obj;
  }

  static fromState(v) {
    return v;
  }
}

export class xBigInt {
  constructor(obj) {
    this.val = obj;
  }

  static fromState(v) {
    if (typeof v === "string") return BigInt(v);
    else return v;
  }
}

export class xText extends xBase {
  constructor(obj) {
    super(obj);
  }
}

export class xVec extends xBase {
  constructor(obj) {
    super(obj);
  }

  fromState(v) {
    if (this.val.name === "xNat8") {
      if (typeof v === "string" && isHexString(v)) {
        return hexStringToUint8Array(v);
      }
    }
    return v;
  }
}
export class xOpt extends xBase {
  constructor(obj) {
    super(obj);
  }
}

export class xVariant extends xBase {
  constructor(obj) {
    super(obj);
  }
}

export class xNull extends xBase {
  constructor(obj) {
    super(obj);
  }
}

export class xPrincipal extends xBase {
  constructor(obj) {
    super(obj);
  }

  static fromState(v) {
    if (typeof v === "string") return Principal.from(v);
    else return v;
  }
}

export class xNat8 extends xBase {
  constructor(obj) {
    super(obj);
  }
}

export class xNat16 extends xBase {
  constructor(obj) {
    super(obj);
  }
}

export class xNat32 extends xBase {
  constructor(obj) {
    super(obj);
  }
}

export class xInt8 extends xBase {
  constructor(obj) {
    super(obj);
  }
}

export class xInt16 extends xBase {
  constructor(obj) {
    super(obj);
  }
}

export class xInt32 extends xBase {
  constructor(obj) {
    super(obj);
  }
}
// start bigint
export class xNat64 extends xBigInt {
  constructor(obj) {
    super(obj);
  }
}

export class xInt64 extends xBigInt {
  constructor(obj) {
    super(obj);
  }
}

export class xNat extends xBigInt {
  constructor(obj) {
    super(obj);
  }
}

export class xInt extends xBigInt {
  constructor(obj) {
    super(obj);
  }
}

export class xTime extends xBigInt {
  constructor(obj) {
    super(obj);
  }
}
// end bigint

export class xFloat extends xBase {
  constructor(obj) {
    super(obj);
  }
}

export class xBool extends xBase {
  constructor(obj) {
    super(obj);
  }
}

export class xRecord extends xBase {
  constructor(obj) {
    super(obj);
  }
}

export class xTuple extends xBase {
  constructor(obj) {
    super(obj);
  }
}

export class xRec extends xBase {
  constructor(obj) {
    super(obj);
  }
  fill(newInstance) {
    Object.setPrototypeOf(this, newInstance.constructor.prototype);
    Object.assign(this, newInstance);
  }
}

class IDLExplainer {
  Text = xText;
  Null = xNull;
  Principal = xPrincipal;
  Nat8 = xNat8;
  Nat16 = xNat16;
  Nat32 = xNat32;
  Nat64 = xNat64;
  Nat = xNat;
  Int8 = xInt8;
  Int16 = xInt16;
  Int32 = xInt32;
  Int64 = xInt64;
  Int = xInt;
  Float = xFloat;
  Bool = xBool;
  Time = xTime;
  Service(o) {
    return o;
  }

  Func(arg, ret, _) {
    return {
      input: arg,
      output: ret,
    };
  }
  Record(o) {
    return new xRecord(o);
  }
  Tuple(...o) {
    return new xTuple(o);
  }
  Rec() {
    return new xRec();
  }
  Vec(o) {
    return new xVec(o);
  }

  Variant(o) {
    return new xVariant(o);
  }
  Opt(a) {
    return new xOpt(a);
  }
}

const IDLWalker = new IDLExplainer();

export const explainer = (idlFactory) => {
  return idlFactory({ IDL: IDLWalker });
};

function convert(input, def) {
  function convertRecursive(ekey, input, def) {
    try {
      if (def instanceof xOpt) {
        if (input === undefined) return [];
        if (input === null) return null;

        return [convertRecursive("(opt)", input, def.val)];
      } else if (def instanceof xVec) {
        input = def.fromState(input);
        if (ArrayBuffer.isView(input) || input instanceof ArrayBuffer)
          return input;

        if (!Array.isArray(input)) {
          throw "(array expected)";
        }
        return input.map((item, idx) => convertRecursive(idx, item, def.val));
      } else if (def instanceof xTuple) {
        if (!Array.isArray(input)) {
          throw "(array expected)";
        }
        return input.map((item, idx) =>
          convertRecursive(idx, item, def.val[idx])
        );
      } else if (def instanceof xVariant) {
        let key = Object.keys(input)[0];
        return { [key]: convertRecursive(key, input[key], def.val[key]) };
      } else if (def instanceof xRecord) {
        const output = {};
        for (const key in def.val) {
          let opt = def.val[key] instanceof xOpt;
          if (!input.hasOwnProperty(key)) {
            if (!opt) throw `${key} (missing)`;
            else output[key] = [];
          } else output[key] = convertRecursive(key, input[key], def.val[key]);
        }
        return output;
      } else {
        return def.fromState(input);
      }
    } catch (e) {
      throw ekey + "." + e;
    }
  }

  const output = input.map((item, idx) =>
    convertRecursive("arg" + idx, item, def[idx])
  );
  return output;
}

function convertBack(input, def) {
  function convertBackRecursive(ekey, input, def) {
    try {
      if (def instanceof xOpt) {
        if (input === null) return null;
        if (input.length === 0) return undefined;

        return convertBackRecursive("(opt)", input[0], def.val);
      } else if (def instanceof xVec) {
        if (ArrayBuffer.isView(input) || input instanceof ArrayBuffer)
          return input;

        if (!Array.isArray(input)) {
          throw "(array expected)";
        }
        return input.map((item, idx) =>
          convertBackRecursive(idx, item, def.val)
        );
      } else if (def instanceof xTuple) {
        if (!Array.isArray(input)) {
          throw "(array expected)";
        }
        return input.map((item, idx) =>
          convertBackRecursive(idx, item, def.val[idx])
        );
      } else if (def instanceof xVariant) {
        let key = Object.keys(input)[0];
        return { [key]: convertBackRecursive(key, input[key], def.val[key]) };
      } else if (def instanceof xRecord) {
        const output = {};
        for (const key in def.val) {
          let opt = def.val[key] instanceof xOpt;
          if (!input.hasOwnProperty(key)) {
            if (!opt) throw `${key} (missing)`;
          } else {
            const value = convertBackRecursive(key, input[key], def.val[key]);
            if (value !== null) {
              output[key] = value;
            }
          }
        }
        return output;
      } else {
        return input;
      }
    } catch (e) {
      throw ekey + "." + e;
    }
  }

  const output = convertBackRecursive(
    "ret",
    input,
    def !== null ? def[0] : true
  );

  if (
    def[0] &&
    def[0] instanceof xVariant &&
    "Ok" in def[0].val &&
    "Err" in def[0].val &&
    Object.keys(def[0].val).length == 2
  ) {
    if ("Ok" in output) return output.Ok;
    else throw output.Err;
  }
  return output;
}

const wrapFunction = (fn, key, xdl) => {
  return async (...args) => {
    const processedArgs = convert(args, xdl[key].input);
    const result = await fn(...processedArgs);
    let cc = convertBack(result, xdl[key].output);
    return cc;
  };
};

export const wrapActor = (obj, idlFactory) => {
  const xdl = explainer(idlFactory);
  const wrappedObject = {};

  for (const key in obj) {
    if (typeof obj[key] === "function") {
      wrappedObject[key] = wrapFunction(obj[key], key, xdl);
    } else {
      wrappedObject[key] = obj[key];
    }
  }

  attachEncoders(wrappedObject, idlFactory, xdl);

  return wrappedObject;
};

const attachEncoders = (target, idlFactory, xdl) => {
  const service = idlFactory({ IDL });

  for (const [methodName, func] of service._fields) {
    target[methodName + "$"] = (...args) => [
      ...IDL.encode(func.argTypes, convert(args, xdl[methodName].input)),
    ];
    target["$" + methodName] = (payload) =>
      convertBack(
        IDL.decode(func.retTypes, Buffer.from(payload)),
        xdl[methodName].output[0]
      );
  }
};

export const toState = (x) => {
  if (x === undefined || x === null) return x;
  if (typeof x === "bigint") return x.toString();
  if (x instanceof Uint8Array) return uint8ArrayToHexString(x);
  if (x instanceof BigInt64Array)
    return uint8ArrayToHexString(x).map((x) => x.toString());
  if (x instanceof BigUint64Array)
    return uint8ArrayToHexString(x).map((x) => x.toString());
  if (ArrayBuffer.isView(x) || x instanceof ArrayBuffer) return [...x];

  if (Array.isArray(x)) {
    return x.map((y) => toState(y));
  }

  if (typeof x === "object") {
    if (x.constructor?.name === "Principal") return x.toText();

    return Object.fromEntries(
      Object.keys(x).map((k) => {
        return [k, toState(x[k])];
      })
    );
  }
  return x;
};

function isHexString(str) {
  return /^[0-9a-fA-F]+$/.test(str);
}

function hexStringToUint8Array(hexString) {
  if (hexString.length % 2 !== 0) {
    throw new Error("Invalid hex string length.");
  }

  const numBytes = hexString.length / 2;
  const uint8Array = new Uint8Array(numBytes);

  for (let i = 0; i < numBytes; i++) {
    const byteValue = parseInt(hexString.slice(i * 2, i * 2 + 2), 16);
    uint8Array[i] = byteValue;
  }

  return uint8Array;
}

function uint8ArrayToHexString(uint8Array) {
  let hexString = "";

  for (let i = 0; i < uint8Array.length; i++) {
    const byteValue = uint8Array[i];
    const byteHex = byteValue.toString(16).padStart(2, "0");
    hexString += byteHex;
  }

  return hexString;
}
