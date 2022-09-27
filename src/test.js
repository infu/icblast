import { Principal } from "@dfinity/principal";
import os from "os";
import icblast, {
  fileIdentity,
  pemIdentity,
  blast,
  file,
  aaaCan,
  cyclesCan,
  internetIdentity,
} from "./sys/index.js";
//

let identity = await internetIdentity();

console.log(identity.getPrincipal().toText());

let ic = icblast({ identity });

let can = await ic("kbzti-laaaa-aaaai-qe2ma-cai");

let res = await can.config_get();

// let identity = fileIdentity(0);

// console.log(identity.getPrincipal().toText());

// let aaa = aaaCan({ agentOptions: { identity } });

// let cy = cyclesCan("ryjl3-tyaaa-aaaaa-aaaba-cai", { agentOptions: { identity } });

// console.log(Principal.fromText(`aaaaa-aa`));

// let r = await aaa.canister_status({
//   canister_id: Principal.fromText("kbzti-laaaa-aaaai-qe2ma-cai"),
// });

// console.log(r);
// let r = await can.config_get();
// console.log(r);
// // console.log("file", await file("./cool.txt"));
