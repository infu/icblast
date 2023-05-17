import { icblast } from "./anycan.js";
import pLimit from "p-limit";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import getRandomValues from "get-random-values";

import { walletCall, walletProxy } from "./walletcall.js";
export { walletCall, walletProxy };
export default icblast;
import { InternetIdentity } from "./browser/auth.js";
export { InternetIdentity };
import { AnonymousIdentity } from "./browser/anon.js";
export { AnonymousIdentity };

import { toState, explainer } from "./actress.js";
export { toState, explainer };

import { sha256 } from "js-sha256";

import * as actress from "./actress.js";
export { actress };

export const file = async (blob) =>
  Array.from(new Uint8Array(await blob.arrayBuffer()));

export const blast = (count, concurrency, func) => {
  const limit = pLimit(concurrency); // max concurrency

  return Promise.all(
    Array(count)
      .fill(0)
      .map((_, idx) => {
        return limit(() => func(idx));
      })
  );
};

export const hashIdentity = (pass) => {
  const hash = sha256.create();
  hash.update(pass);
  let entropy = new Uint8Array(hash.digest());
  let identity = Ed25519KeyIdentity.generate(entropy);
  return identity;
};

export const tempIdentity = (key) => {
  let idk = window.localStorage.getItem("tmpid" + key);

  if (!idk) {
    idk = JSON.stringify(newIdentity().toJSON());
    window.localStorage.setItem("tmpid" + key, idk);
  }

  return Ed25519KeyIdentity.fromParsedJson(JSON.parse(idk));
};

const newIdentity = () => {
  const entropy = getRandomValues(new Uint8Array(32));
  const identity = Ed25519KeyIdentity.generate(entropy);
  return identity;
};
