import "isomorphic-fetch";

import { icblast } from "./anycan.js";
import { fileIdentity } from "./identity.js";
import pLimit from "p-limit";
import { blobFrom } from "fetch-blob/from.js";

import { walletCall, walletProxy } from "./walletcall.js";
import { toState, explainer } from "./actress.js";
export { toState, explainer };
export { fileIdentity, walletCall, walletProxy };
export default icblast;

import * as actress from "./actress.js";
export { actress };

export const file = async (path) =>
  Array.from(new Uint8Array(await (await blobFrom(path)).arrayBuffer()));

export const blast = (count, concurrency, func) => {
  concurrency = concurrency > 10 ? 10 : Math.abs(concurrency); // script kiddie protection
  const limit = pLimit(concurrency); // max concurrency

  return Promise.all(
    Array(count)
      .fill(0)
      .map((_, idx) => {
        return limit(() => func(idx));
      })
  );
};
