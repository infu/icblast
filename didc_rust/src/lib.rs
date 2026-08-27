// Adapted from the Candid 0.10.17 wasm-bindgen example, licensed Apache-2.0:
// https://github.com/dfinity/candid/blob/ebc9c615db87aa26cf8e9c9716e1ac18d63763a4/rust/candid/src/lib.rs
// Modified by icblast to validate one program and return JavaScript,
// TypeScript, and Motoko bindings through a dedicated Bindings value.

use candid::TypeEnv;
use candid_parser::{check_prog, IDLProg};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Bindings {
    js: String,
    ts: String,
    motoko: String,
}

#[wasm_bindgen]
impl Bindings {
    #[wasm_bindgen(getter)]
    pub fn js(&self) -> String { self.js.clone() }
    #[wasm_bindgen(getter)]
    pub fn ts(&self) -> String { self.ts.clone() }
    #[wasm_bindgen(getter)]
    pub fn motoko(&self) -> String { self.motoko.clone() }
}

#[wasm_bindgen]
pub fn generate(prog: &str) -> Option<Bindings> {
    let ast = prog.parse::<IDLProg>().ok()?;
    let mut env = TypeEnv::new();
    let actor = check_prog(&mut env, &ast).ok()?;
    Some(Bindings {
        js: candid_parser::bindings::javascript::compile(&env, &actor),
        ts: candid_parser::bindings::typescript::compile(&env, &actor),
        motoko: candid_parser::bindings::motoko::compile(&env, &actor),
    })
}
