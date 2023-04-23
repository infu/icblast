import { IDL } from "@dfinity/candid";

class IDLTree {
  Text = true;
  Null = true;
  Principal = true;
  Nat8 = true;
  Nat16 = true;
  Nat32 = true;
  Nat64 = true;
  Nat = true;
  Int8 = true;
  Int16 = true;
  Int32 = true;
  Int64 = true;
  Int = true;
  Float = true;
  Bool = true;
  Time = true;
  Service(o) {
    return o;
  }

  Func(arg, ret, opt) {
    return {
      input: explainObj(arg, { voi: true }),
      output: explainObj(ret, {
        voi: false,
      }),
    };
  }
  Record(o) {
    return explainObj(o);
  }
  Tuple(...o) {
    return { __type: "tuple", val: explainObj(o) };
  }
  Rec() {
    var o = {
      _type: {},
    };
    o.fill = (s) => {
      o._type = explainObj(s);
    };
    return o;
  }
  Vec(o) {
    return { __type: "vec", val: explainObj(o) };
  }

  Variant(o) {
    return { __type: "variant", val: explainObj(o) };
  }
  Opt(a) {
    return { __type: "opt", val: explainObj(a) };
  }
}
const explainObj = (
  x,
  { voi = false, visitedNodes = new WeakSet(), cache = new WeakMap() } = {}
) => {
  if (Array.isArray(x)) {
    if (!voi && !x.length) return null;
    return x.map((el) => explainObj(el, { visitedNodes, cache, voi }));
  }
  if (typeof x === "object") {
    if ("_type" in x) return x._type;

    if (visitedNodes.has(x)) {
      return cache.get(x);
    }
    visitedNodes.add(x);

    const result = Object.assign(
      {},
      ...Object.keys(x).map((k) => ({
        [k]: explainObj(x[k], { visitedNodes, cache, voi }),
      }))
    );

    // Cache the result for this object.
    cache.set(x, result);

    return result;
  }
  return x;
};

const IDLO = new IDLTree();

export const explainer = (idlFactory) => {
  return idlFactory({ IDL: IDLO });
};
function convert(input, def) {
  function convertRecursive(ekey, input, def) {
    try {
      if (def === true) {
        return input;
      } else if (def.__type === "opt") {
        if (input === null) {
          return null;
        }
        return [convertRecursive("(opt)", input, def.val)];
      } else if (def.__type === "vec") {
        if (ArrayBuffer.isView(input) || input instanceof ArrayBuffer)
          return input;
        if (!Array.isArray(input)) {
          throw "(array expected)";
        }
        return input.map((item, idx) => convertRecursive(idx, item, def.val));
      } else if (def.__type === "tuple") {
        if (!Array.isArray(input)) {
          throw "(array expected)";
        }
        return input.map((item, idx) =>
          convertRecursive(idx, item, def.val[idx])
        );
      } else if (def.__type === "variant") {
        let key = Object.keys(input)[0];
        return { [key]: convertRecursive(key, input[key], def.val[key]) };
      } else {
        const output = {};
        for (const key in def) {
          let opt = def[key]?.__type === "opt";
          if (!input.hasOwnProperty(key)) {
            if (!opt) throw `${key} (missing)`;
            else output[key] = [];
          } else output[key] = convertRecursive(key, input[key], def[key]);
        }
        return output;
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
      if (def === true) {
        return input;
      } else if (def.__type === "opt") {
        if (input === null || input.length === 0) {
          return null;
        }
        return convertBackRecursive("(opt)", input[0], def.val);
      } else if (def.__type === "vec") {
        if (ArrayBuffer.isView(input) || input instanceof ArrayBuffer)
          return input;

        if (!Array.isArray(input)) {
          throw "(array expected)";
        }
        return input.map((item, idx) =>
          convertBackRecursive(idx, item, def.val)
        );
      } else if (def.__type === "tuple") {
        if (!Array.isArray(input)) {
          throw "(array expected)";
        }
        return input.map((item, idx) =>
          convertBackRecursive(idx, item, def.val[idx])
        );
      } else if (def.__type === "variant") {
        let key = Object.keys(input)[0];
        return { [key]: convertBackRecursive(key, input[key], def.val[key]) };
      } else {
        const output = {};
        for (const key in def) {
          let opt = def[key]?.__type === "opt";
          if (!input.hasOwnProperty(key)) {
            if (!opt) throw `${key} (missing)`;
          } else {
            const value = convertBackRecursive(key, input[key], def[key]);
            if (value !== null) {
              output[key] = value;
            }
          }
        }
        return output;
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
    def &&
    def.__type === "variant" &&
    def.val.Ok &&
    def.val.Err &&
    Object.keys(def.val).length == 2
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

    return convertBack(result, xdl[key].output);
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
