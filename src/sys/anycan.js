import { Actor, HttpAgent } from "@dfinity/agent";

import fetch from "node-fetch";

import { ifhackCanister } from "./ifhack.js";
import { attachEncoders } from "./encoders.js";
const didc = import("./lib/didc_js.cjs");

import * as preset_ic from "./ic/ic.did.js";
import * as preset_wallet from "./wallet/wallet.did.js";
import { Principal } from "@dfinity/principal";

let bindings = {};

export const icblast =
  ({ local = false, local_host = false, identity = false } = {}) =>
  async (canId, preset = false) => {
    const IC_HOST = local
      ? local_host || "http://localhost:8000/"
      : "https://ic0.app";

    if (bindings[canId]) return bindings[canId];
    let idlFactory = preset
      ? getLocal(preset)
      : await downloadBindings(canId, IC_HOST);

    const creator = (options) => {
      const agent = new HttpAgent({
        host: IC_HOST,
        fetch,
        identity,
        ...options?.agentOptions,
      });

      // Fetch root key for certificate validation during development
      if (local) {
        agent.fetchRootKey().catch((err) => {
          console.warn(
            "Unable to fetch root key. Check to ensure that your local replica is running"
          );
          console.error(err);
        });
      }

      // Creates an actor with using the candid interface and the HttpAgent
      let actor = Actor.createActor(idlFactory, {
        agent,
        canisterId: canId.toText ? canId.toText() : canId,
        ...options?.actorOptions,
      });

      attachEncoders(actor, idlFactory);
      actor.$principal = Principal.fromText(canId);
      return actor;
    };

    bindings[canId] = creator();
    return bindings[canId];
  };

const getLocal = (preset) => {
  switch (preset) {
    case "ic":
      return preset_ic.idlFactory;
    case "wallet":
      return preset_wallet.idlFactory;
    default:
      throw new Error("Available presets: ic, wallet");
  }
};

const downloadBindings = async (canId, IC_HOST) => {
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
          resolve(idlFactory);
        });
      } else {
        console.warn("failed to generate bindings");
        reject();
      }
    });
  });
};
