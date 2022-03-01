import { Actor, HttpAgent } from "@dfinity/agent";

import fetch from "node-fetch";

import { ifhackCanister } from "./ifhack.js";
const didc = import("./lib/didc_js.cjs");

const IC_HOST =
  process.env.NODE_ENV !== "production"
    ? process.env.IC_HOST
    : "https://ic0.app";

let bindings = {};

export const anycan = async (canId, identity = false) => {
  if (bindings[canId]) return bindings[canId];
  let ifcan = ifhackCanister(canId, {
    agentOptions: {
      host: IC_HOST,
      fetch,
    },
  });

  let txt = await ifcan.__get_candid_interface_tmp_hack();

  return new Promise((resolve, reject) => {
    didc.then((mod) => {
      const gen = mod.generate(txt);
      if (gen) {
        let jsCode = gen.js;
        const dataUri =
          "data:text/javascript;charset=utf-8," + encodeURIComponent(jsCode);

        import(dataUri).then((ns) => {
          const idlFactory = ns.idlFactory;

          const creator = (options) => {
            const agent = new HttpAgent({
              host: IC_HOST,
              fetch,
              identity,
              ...options?.agentOptions,
            });

            // Fetch root key for certificate validation during development
            if (process.env.NODE_ENV !== "production") {
              agent.fetchRootKey().catch((err) => {
                console.warn(
                  "Unable to fetch root key. Check to ensure that your local replica is running"
                );
                console.error(err);
              });
            }

            // Creates an actor with using the candid interface and the HttpAgent
            return Actor.createActor(idlFactory, {
              agent,
              canisterId: canId.toText ? canId.toText() : canId,
              ...options?.actorOptions,
            });
          };

          bindings[canId] = creator();

          resolve(bindings[canId]);
        });
      } else {
        console.warn("failed to generate bindings");
        reject();
      }
    });
  });
};
