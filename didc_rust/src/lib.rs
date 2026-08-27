// Adapted from the Candid 0.10.17 wasm-bindgen example, licensed Apache-2.0:
// https://github.com/dfinity/candid/blob/ebc9c615db87aa26cf8e9c9716e1ac18d63763a4/rust/candid/src/lib.rs
// Modified by icblast to validate one program and return only the JavaScript
// binding consumed by the browser and Node runtimes.

use candid::TypeEnv;
use candid_parser::{check_prog, IDLProg};
use wasm_bindgen::prelude::*;

fn protect_proto_object_keys(javascript: String) -> String {
    // A quoted `__proto__` in an object literal invokes JavaScript's legacy
    // prototype-setter syntax instead of defining a Candid field. A computed
    // key is an ordinary own data property. candid_parser emits this exact
    // token for service, record, and variant labels.
    javascript.replace("'__proto__' :", "['__proto__'] :")
}

#[wasm_bindgen]
pub fn generate(prog: &str) -> Option<String> {
    let ast = prog.parse::<IDLProg>().ok()?;
    let mut env = TypeEnv::new();
    let actor = check_prog(&mut env, &ast).ok()?;
    Some(protect_proto_object_keys(
        candid_parser::bindings::javascript::compile(&env, &actor),
    ))
}

#[cfg(test)]
mod tests {
    use super::generate;

    #[test]
    fn generates_proto_labels_as_own_object_properties() {
        let javascript = generate(
            r#"service : {
                "__proto__" : (record { "__proto__" : text }) ->
                    (variant { "__proto__" : text });
            }"#,
        )
        .expect("valid Candid should compile");

        assert_eq!(javascript.matches("['__proto__'] :").count(), 3);
        assert!(!javascript.contains("{ '__proto__' :"));
    }
}
