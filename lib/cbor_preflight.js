const SELF_DESCRIBED_CBOR_TAG = 55799n;
const INDEFINITE = Symbol("indefinite");
const PROTO_KEY_BYTES = Uint8Array.of(
  0x5f, 0x5f, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x5f, 0x5f,
);

export const DEFAULT_CBOR_PREFLIGHT_LIMITS = Object.freeze({
  maxBytes: 4 * 1024 * 1024,
  maxItems: 100_000,
  maxDepth: 256,
});

export class CborPreflightError extends Error {
  constructor(message) {
    super(message);
    this.name = "CborPreflightError";
  }
}

function positiveSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function bytesView(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError("CBOR input must be an ArrayBuffer or an ArrayBuffer view");
}

/**
 * Validate one complete value before passing its bytes to @dfinity/cbor.
 *
 * The scan is iterative and only retains one small frame per nesting level. It
 * deliberately accepts the CBOR subset understood by @dfinity/cbor: integers,
 * definite byte/text strings, arrays, text-keyed maps, the self-described CBOR
 * tag, booleans, null, and undefined. Arrays and maps may be indefinite.
 */
export function preflightCbor(input, options = {}) {
  const bytes = bytesView(input);
  const maxBytes = positiveSafeInteger(
    options.maxBytes ?? DEFAULT_CBOR_PREFLIGHT_LIMITS.maxBytes,
    "maxBytes",
  );
  const maxItems = positiveSafeInteger(
    options.maxItems ?? DEFAULT_CBOR_PREFLIGHT_LIMITS.maxItems,
    "maxItems",
  );
  const maxDepth = positiveSafeInteger(
    options.maxDepth ?? DEFAULT_CBOR_PREFLIGHT_LIMITS.maxDepth,
    "maxDepth",
  );

  if (bytes.byteLength > maxBytes) {
    throw new CborPreflightError(
      `CBOR value exceeds ${maxBytes} bytes`,
    );
  }
  if (bytes.byteLength === 0) {
    throw new CborPreflightError("CBOR value is empty");
  }

  let offset = 0;
  let items = 0;
  let observedDepth = 0;
  const stack = [{ kind: "root", remaining: 1, depth: 0 }];

  const fail = (message) => {
    throw new CborPreflightError(`${message} at byte ${offset}`);
  };

  const readArgument = (additionalInfo) => {
    if (additionalInfo < 24) return BigInt(additionalInfo);

    let width;
    if (additionalInfo === 24) width = 1;
    else if (additionalInfo === 25) width = 2;
    else if (additionalInfo === 26) width = 4;
    else if (additionalInfo === 27) width = 8;
    else if (additionalInfo === 31) return INDEFINITE;
    else fail(`Unsupported CBOR additional information ${additionalInfo}`);

    if (bytes.byteLength - offset < width) {
      fail("Unexpected end of CBOR argument");
    }
    let value = 0n;
    for (let index = 0; index < width; index += 1) {
      value = (value << 8n) | BigInt(bytes[offset++]);
    }
    return value;
  };

  const skipString = (length) => {
    if (length === INDEFINITE) {
      fail("Indefinite byte and text strings are unsupported");
    }
    const remainingBytes = BigInt(bytes.byteLength - offset);
    if (length > remainingBytes) fail("CBOR string exceeds the input length");
    offset += Number(length);
  };

  const consumeParentSlot = (majorType) => {
    const parent = stack[stack.length - 1];
    if (parent.kind === "map") {
      if (parent.expectKey && majorType !== 3) {
        fail("CBOR map keys must be text strings");
      }
      parent.expectKey = !parent.expectKey;
    }
    if (parent.remaining !== INDEFINITE) parent.remaining -= 1;
    return parent.depth + 1;
  };

  const pushFrame = (kind, remaining, depth) => {
    stack.push({
      kind,
      remaining,
      depth,
      ...(kind === "map" ? { expectKey: true } : {}),
    });
  };

  while (stack.length > 0) {
    const parent = stack[stack.length - 1];
    if (parent.remaining === 0) {
      if (parent.kind === "map" && !parent.expectKey) {
        fail("CBOR map is missing a value");
      }
      stack.pop();
      continue;
    }
    if (offset >= bytes.byteLength) fail("Unexpected end of CBOR input");

    const initialByte = bytes[offset];
    const majorType = initialByte >>> 5;
    const additionalInfo = initialByte & 0x1f;
    if (majorType === 7 && additionalInfo === 31) {
      if (parent.remaining !== INDEFINITE ||
          (parent.kind !== "array" && parent.kind !== "map")) {
        fail("Unexpected CBOR break marker");
      }
      if (parent.kind === "map" && !parent.expectKey) {
        fail("CBOR map is missing a value");
      }
      offset += 1;
      stack.pop();
      continue;
    }

    offset += 1;
    const isMapKey = parent.kind === "map" && parent.expectKey;
    const depth = consumeParentSlot(majorType);
    items += 1;
    if (items > maxItems) {
      throw new CborPreflightError(`CBOR value exceeds ${maxItems} items`);
    }
    if (depth > maxDepth) {
      throw new CborPreflightError(
        `CBOR value exceeds a nesting depth of ${maxDepth}`,
      );
    }
    observedDepth = Math.max(observedDepth, depth);

    const argument = readArgument(additionalInfo);
    switch (majorType) {
      case 0:
      case 1:
        if (argument === INDEFINITE) fail("Indefinite CBOR integer");
        break;

      case 2:
        skipString(argument);
        break;

      case 3: {
        const start = offset;
        skipString(argument);
        if (isMapKey && offset - start === PROTO_KEY_BYTES.byteLength) {
          let isProtoKey = true;
          for (let index = 0; index < PROTO_KEY_BYTES.byteLength; index += 1) {
            if (bytes[start + index] !== PROTO_KEY_BYTES[index]) {
              isProtoKey = false;
              break;
            }
          }
          if (isProtoKey) fail("Unsafe CBOR map key __proto__");
        }
        break;
      }

      case 4: {
        if (argument === INDEFINITE) {
          pushFrame("array", INDEFINITE, depth);
          break;
        }
        const availableItems = BigInt(maxItems - items);
        if (argument > availableItems) {
          throw new CborPreflightError(
            `CBOR value exceeds ${maxItems} items`,
          );
        }
        if (argument > BigInt(bytes.byteLength - offset)) {
          fail("CBOR array length exceeds the remaining input");
        }
        pushFrame("array", Number(argument), depth);
        break;
      }

      case 5: {
        if (argument === INDEFINITE) {
          pushFrame("map", INDEFINITE, depth);
          break;
        }
        const childItems = argument * 2n;
        const availableItems = BigInt(maxItems - items);
        if (childItems > availableItems) {
          throw new CborPreflightError(
            `CBOR value exceeds ${maxItems} items`,
          );
        }
        if (childItems > BigInt(bytes.byteLength - offset)) {
          fail("CBOR map length exceeds the remaining input");
        }
        pushFrame("map", Number(childItems), depth);
        break;
      }

      case 6:
        if (argument !== SELF_DESCRIBED_CBOR_TAG) {
          fail(`Unsupported CBOR tag ${String(argument)}`);
        }
        pushFrame("tag", 1, depth);
        break;

      case 7:
        if (additionalInfo < 20 || additionalInfo > 23) {
          fail(`Unsupported CBOR simple value ${additionalInfo}`);
        }
        break;

      default:
        fail(`Unsupported CBOR major type ${majorType}`);
    }
  }

  if (offset !== bytes.byteLength) {
    fail("Trailing data after the CBOR value");
  }

  return { bytes: bytes.byteLength, items, depth: observedDepth };
}
