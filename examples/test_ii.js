import { internetIdentity } from "../src/ndex.js";

let identity = await internetIdentity();
console.log(identity.getPrincipal().toText());
