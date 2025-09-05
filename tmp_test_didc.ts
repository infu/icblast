import { HttpAgent, CanisterStatus } from "https://esm.sh/@dfinity/agent@3.2.3";
import { Principal } from "https://esm.sh/@dfinity/principal@3.2.3";
import * as mod from "./didc_wasm_pkg/didc_rust.js";

const host = 'https://icp0.io';
const can = Deno.args[0];
const agent = new HttpAgent({ host });
const p = Principal.fromText(can);
const st = await CanisterStatus.request({ agent, canisterId: p, paths: ["candid"] });
const did = st.get('candid') as string;
console.log('DID length', did.length);
const wasmBin = await Deno.readFile('./didc_wasm_pkg/didc_rust_bg.bin');
(mod as any).initSync({ module: wasmBin });
const bindings = (mod as any).generate(did);
console.log('bindings obj keys', Object.keys(bindings||{}));
console.log('js size', bindings?.js?.length);
