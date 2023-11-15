import "isomorphic-fetch";

import { icblast } from "./anycan.js";
import { fileIdentity } from "./identity.js";
// import pLimit from "p-limit";
// import { blobFrom } from "fetch-blob/from.js";

import { walletCall, walletProxy } from "./walletcall.js";
import {
  toState,
  explainer,
  convert,
  convertBack,
  initArg,
} from "./actress.js";
import { sha256 } from "js-sha256";
import { Ed25519KeyIdentity } from "@dfinity/identity";

export { toState, explainer, convert, convertBack, initArg };
export { fileIdentity, walletCall, walletProxy };
export default icblast;

import * as actress from "./actress.js";
export { actress };

// Doesn't work in Electron
// export const file = async (path) =>
//   Array.from(new Uint8Array(await (await blobFrom(path)).arrayBuffer()));

export const hashIdentity = (pass) => {
  const hash = sha256.create();
  hash.update(pass);
  let entropy = new Uint8Array(hash.digest());
  let identity = Ed25519KeyIdentity.generate(entropy);
  return identity;
};

export const file = async (blob) =>
  Array.from(new Uint8Array(await blob.arrayBuffer()));

// export const blast = (count, concurrency, func) => {
//   concurrency = concurrency > 10 ? 10 : Math.abs(concurrency); // script kiddie protection
//   const limit = pLimit(concurrency); // max concurrency

//   return Promise.all(
//     Array(count)
//       .fill(0)
//       .map((_, idx) => {
//         return limit(() => func(idx));
//       })
//   );
// };
