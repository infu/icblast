import { icblast } from "./anycan.js";
import pLimit from "p-limit";

import { walletCall, walletProxy } from "./walletcall.js";
export { walletCall, walletProxy };
export default icblast;

export const file = async (blob) =>
  Array.from(new Uint8Array(await blob.arrayBuffer()));

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
