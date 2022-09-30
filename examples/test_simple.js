import icblast, { fileIdentity } from "../src/index.js";

let identity = await fileIdentity(0);
console.log(identity.getPrincipal().toText());
let ic = icblast({ identity }); // can switch identity or go local

let my = await ic("kbzti-laaaa-aaaai-qe2ma-cai");
console.log(await my.config_get());
