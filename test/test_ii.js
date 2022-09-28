import { internetIdentity } from "../src/sys/index.js";

let identity = await internetIdentity();
console.log(identity.getPrincipal().toText());
