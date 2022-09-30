import { Principal } from "@dfinity/principal";
import icblast, {
  fileIdentity,
  blast,
  file,
  internetIdentity,
  walletProxy,
} from "../src/index.js";

let identity = await fileIdentity(0);
console.log(identity.getPrincipal().toText());

// Note: This won't work unless the wallet is the controller of the canister you are checking
// the status of. And also won't work if you don't have the current identity added as controller in
// the wallet canister.

let ic = icblast({ identity }); // can switch identity or go local

let aaa = await ic("aaaaa-aa", "ic");
let wallet = await ic("vlgg5-pyaaa-aaaai-qaqba-cai", "wallet");

let res = await walletProxy(wallet, aaa).canister_status({ canister_id: Principal.fromText("kbzti-laaaa-aaaai-qe2ma-cai") });

console.log(res);
