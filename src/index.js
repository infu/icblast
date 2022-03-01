import { anycan, fileIdentity, blast } from "./sys/index.js";

console.time("TEST");

let identityJohn = fileIdentity(0);

// TIP: Go to Motoko Playground at https://m7sm4-2iaaa-aaaab-qabra-cai.raw.ic0.app/
// Choose "Counter" and deploy it
// Take the canister id and put replace it in this code

let counterCanJohn = await anycan("wfg2r-bqaaa-aaaab-qadfq-cai", identityJohn);

// let counterCanJohn = await anycan("xblvd-yqaaa-aaaab-qaddq-cai", identityJohn);

// If you need different callers
// let identityPeter = fileIdentity(1);
// let counterCanPeter = await anycan("x2ojg-ciaaa-aaaab-qadba-cai", identityPeter);

const delay = (ms) => new Promise((resolve, _) => setTimeout(resolve, ms));

// sends 10 requests with max concurrency 5 at a time
let results = await blast(10, 5, async (idx) => {
  await delay(1); //NOTE: for some unknown to me reason if there is no delay, things appear to be "grouped" into one call and we will get the same result

  return counterCanJohn.inc();
});

console.log(results);
console.timeEnd("TEST");
