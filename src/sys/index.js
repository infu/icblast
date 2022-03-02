import "dotenv/config";
import { anycan } from "./anycan.js";
import { fileIdentity } from "./identity.js";
import pLimit from "p-limit";

export { anycan, fileIdentity };

export const blast = (count, concurrency, func) => {
  concurrency = (concurrency > 10)?10:Math.abs(concurrency); // script kiddie protection
  const limit = pLimit(concurrency); // max concurrency

  return Promise.all(
    Array(count)
      .fill(0)
      .map((_, idx) => {
        return limit(() => func(idx));
      })
  );
};
