import { Principal } from "@dfinity/principal";
import icblast, {
  fileIdentity,
  blast,
  file,
  internetIdentity,
  walletCall,
} from "../src/sys/index.js";

// Deploy a canister and take the canister_id
// from this playground: https://m7sm4-2iaaa-aaaab-qabra-cai.raw.ic0.app/?tag=1212716285
let canister_id = "6zfvq-kiaaa-aaaab-qacra-cai";

let ic = icblast();
let can = await ic(canister_id);

await can.put(await file("./testfile.bin"));

let fetched_file = await can.get();

console.log(fetched_file);
