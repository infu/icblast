import { Actor, HttpAgent, CanisterStatus } from "@dfinity/agent";

import { ifhackCanister } from "./ifhack.js";
import { wrapActor } from "./actress.js";
// const didc = import("./lib/didc_js.js");

import * as preset_ic from "./did/ic.did.js";
import * as preset_wallet from "./did/wallet.did.js";
import * as preset_pg from "./did/pg.did.js";
import * as preset_evalcan from "./did/evalcan.did.js";
import * as preset_ledger from "./did/ledger.did.js";
import * as preset_nns from "./did/nns.did.js";
import * as preset_nnsdapp from "./did/nnsdapp.did.js";
import * as preset_sns from "./did/sns.did.js";
import * as preset_cmc from "./did/cmc.did.js";
import * as preset_psy_wicp from "./did/psy_wicp.did.js";
import * as preset_psy_xtc from "./did/psy_xtc.did.js";

import { Principal } from "@dfinity/principal";

export const icblast = ({
  local = false,
  local_host = false,
  identity = false,
  agentOptions = {},
  actorOptions = {},
} = {}) => {
  let bindings = {};

  const IC_HOST = local
    ? local_host || "http://localhost:4943/"
    : "https://icp0.io";

  const agent = HttpAgent.createSync({
    host: IC_HOST,
    identity,
    ...agentOptions,
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

  return async (canId, preset = false) => {
    if (canId instanceof Principal) canId = canId.toText();
    if (canId === "aaaaa-aa") preset = "ic";
    if (canId === "rkp4c-7iaaa-aaaaa-aaaca-cai") preset = "cmc";

    if (bindings[canId]) return bindings[canId];

    let idlFactory;

    if (preset) {
      if (typeof preset === "string" && preset.indexOf("https://") === 0)
        preset = await fetch(preset).then((x) => x.text());
      if (typeof preset === "function") idlFactory = preset;
      else if (preset.length > 30) {
        if (preset.indexOf("idlFactory") !== -1)
          // not a very reliable way to tell js and candid apart
          idlFactory = await didJsEval(preset);
        else idlFactory = await didToJs(preset);
      } else idlFactory = getLocal(preset);
    } else {
      let dl = await downloadBindings(agent, canId, IC_HOST, local);
      idlFactory = dl.idlFactory;
    }

    const creator = () => {
      // Creates an actor with using the candid interface and the HttpAgent
      let actor = Actor.createActor(idlFactory, {
        agent,
        canisterId: canId.toText ? canId.toText() : canId,
        ...actorOptions,
      });

      let wrapped = wrapActor(actor, idlFactory);
      wrapped.$principal = Principal.fromText(canId);
      wrapped.$idlFactory = idlFactory;

      return wrapped;
    };

    bindings[canId] = creator();
    return bindings[canId];
  };
};

const getLocal = (preset) => {
  switch (preset) {
    case "ic":
      return preset_ic.idlFactory;
    case "wallet":
      return preset_wallet.idlFactory;
    case "pg":
      return preset_pg.idlFactory;
    case "evalcan":
      return preset_evalcan.idlFactory;
    case "nns":
      return preset_nns.idlFactory;
    case "nnsdapp":
      return preset_nnsdapp.idlFactory;
    case "ledger":
      return preset_ledger.idlFactory;
    case "sns":
      return preset_sns.idlFactory;
    case "cmc":
      return preset_cmc.idlFactory;
    case "psy_wicp":
      return preset_psy_wicp.idlFactory;
    case "psy_xtc":
      return preset_psy_xtc.idlFactory;
    default:
      throw new Error("Unable to find IDL");
  }
};

let IDLpattern = /\({ IDL }\)\s*=>\s*{.*?(?=export const|$)/s;
const didJsEval = (content) => {
  let match = content.match(IDLpattern);

  if (match) {
    let replaced_js = match[0];
    let idlFactory = eval(replaced_js);
    return idlFactory;
  }

  return false;
};

const didToJs = async (source) => {
  let pg = await icblast()("a4gq6-oaaaa-aaaab-qaa4q-cai", "pg");
  const js = await pg.did_to_js(source);

  if (!js) {
    // === []
    return undefined;
  }

  return didJsEval(js);
  // const dataUri =
  //   "data:text/javascript;charset=utf-8," + encodeURIComponent(js);
  // // eslint-disable-next-line no-eval
  // const candid = await eval('import("' + dataUri + '")');

  // return candid.idlFactory;
};

// const didJsEval = async (content) => {
//   const dataUri =
//     "data:text/javascript;charset=utf-8," + encodeURIComponent(content);
//   // eslint-disable-next-line no-eval
//   const candid = await eval('import("' + dataUri + '")');
//   return candid.idlFactory;
// };

const downloadBindings = async (agent, canId, IC_HOST, local) => {
  // Attempt to use canister metadata
  const status = await CanisterStatus.request({
    agent,
    canisterId: Principal.fromText(canId),
    paths: ["candid"],
  });

  let did = false;
  try {
    did = status.get("candid");
  } catch (e) {}
  if (!did) {
    let ifcan = ifhackCanister(
      canId,
      {
        agentOptions: {
          host: IC_HOST,
        },
      },
      local
    );

    did = await ifcan.__get_candid_interface_tmp_hack();
  }

  // return new Promise((resolve, reject) => {
  //   didc.then((mod) => {
  // if (!mod.generate) {
  // we are running in a browser probably and it doesn't know how to import .wasm
  // so we will call the IC service used by the Motoko Playground
  let idlFactory = await didToJs(did);
  return { idlFactory, did };
  // }

  // const gen = mod.generate(did);
  // if (gen) {
  //   let jsCode = gen.js;

  //   const idlFactory = didJsEval(jsCode);
  //   // const dataUri =
  //   //   "data:text/javascript;charset=utf-8," + encodeURIComponent(jsCode);

  //   // import(dataUri).then((ns) => {
  //   //   const idlFactory = ns.idlFactory;
  //   resolve({ idlFactory, did });
  //   // });
  // } else {
  //   console.warn("failed to generate bindings");
  //   reject();
  // }
  //   });
  // });
};
