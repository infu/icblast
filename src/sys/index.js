import "dotenv/config";
import { icblast } from "./anycan.js";
import { fileIdentity, pemIdentity } from "./identity.js";
import pLimit from "p-limit";
import { blobFrom } from "fetch-blob/from.js";
import { cyclesCan } from "./cycles.js";
import { aaaCan } from "./aaa.js";
import { internetIdentity } from "./internetIdentity.js";

export { fileIdentity, pemIdentity, aaaCan, cyclesCan, internetIdentity };
export default icblast;

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
