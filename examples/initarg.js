import { explainer, convert, initArg } from "../src/index.js";
import { IDL } from "@dfinity/candid";
import { init, idlFactory } from "./ledger.idl.js";

let ledger_args = {
  Init: {
    minting_account: {
      owner: "aaaaa-aa",
    },
    fee_collector_account: { owner: "aaaaa-aa" },
    transfer_fee: 10000,
    decimals: 8,
    token_symbol: "Test",
    token_name: "Test",
    metadata: [],
    initial_balances: [[{ owner: "aaaaa-aa" }, 100000000000]],
    archive_options: {
      num_blocks_to_archive: 10000,
      trigger_threshold: 9000,
      controller_id: "aaaaa-aa",
    },
  },
};

console.log(initArg(init, [ledger_args]));
