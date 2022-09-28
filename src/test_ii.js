import { internetIdentity } from "./sys/index.js";

let identity = await internetIdentity();
console.log(identity.getPrincipal().toText());
