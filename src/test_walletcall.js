import { Principal } from "@dfinity/principal";
import icblast from "./sys/index.js";

// Note: This won't work unless the wallet is the controller of the canister you are checking
// the status of. And also won't work if you don't have the current identity added as controller in
// the wallet canister.

let identity = await fileIdentity(0);

let ic = icblast({ identity }); // can switch identity or go local

// we need to specify "ic" preset because this canister doesn't support downloading IDL spec
let aaa = await ic("aaaaa-aa", "ic");

// each method has also a version with $ suffix. It will not make a call but return the encoded arguments.
// Useful for proxy calls
let encoded = aaa.canister_status$({
  canister_id: Principal.fromText("kbzti-laaaa-aaaai-qe2ma-cai"),
});

// we need to specify "wallet" preset for this canister as well
let wallet = await ic("vlgg5-pyaaa-aaaai-qaqba-cai", "wallet");

// now we make a wallet proxy call
let response = await wallet.wallet_call({
  args: encoded,
  cycles: 0,
  method_name: "canister_status",
  canister: Principal.fromText("aaaaa-aa"),
});

// each method has also version with $ prefix. It will decode responses
let decoded = aaa.$canister_status(Buffer.from(response.Ok.return));

console.log(decoded);
