# Third-party notices

## Scope and boundary

The npm package contains an embedded local Candid compiler in
`didc_wasm_pkg/didc_rust.js` and
`didc_wasm_pkg/didc_rust_bg.bin`. Those generated files combine an
Apache-licensed adaptation of Candid's wasm-bindgen example in
`didc_rust/src/lib.rs` with third-party Rust components. The adapted and
third-party portions are not represented as original icblast authorship.

This inventory is deliberately conservative and bounded: it lists every
registry package in the checked-in `didc_rust/Cargo.lock` and the complete
source closure of the path-patched `pretty` package, including components that
may not leave code in the final WebAssembly. It therefore cannot omit a Rust
dependency merely because optimization removed its symbols. Ordinary npm
dependencies are not copied into the icblast tarball; npm installs those as
separate packages carrying their own license metadata and files.

Artifact evidence for this inventory:

- `didc_wasm_pkg/didc_rust.js`: SHA-256
  `02847c0d670b9291bdadb173de69285a14acec864f2d0f000bd232c465d5d8cd`.
- `didc_wasm_pkg/didc_rust_bg.bin`: 870,492 bytes; SHA-256
  `4235e33cd96b3fde282514cfd73b96041c0290aea02e3e786ba715ac3eb01508`.
- `didc_rust/Cargo.lock`: SHA-256
  `b4b34b369d706fb199c320995c1a2c0c6287fa09925d670e5faffb1df2252e02`.
- `didc_rust/Cargo.toml`: SHA-256
  `63a0e3630ceef952f2936e5acf867c8b987353c26a68d0c8efeed7ab1182917f`.
- `didc_rust/src/lib.rs`: SHA-256
  `86d0534c847ace34b213ea526b0a732f106f765f276afc859047a88b3946d8e5`.
- The WebAssembly producer section records Rust
  `1.89.0 (29483883e 2025-08-04)`, wasm-bindgen `0.2.100`, and
  walrus `0.23.3`.

## License treatment

The local Rust wrapper is an Apache-2.0 adaptation of Candid 0.10.17's
wasm-bindgen example; `didc_rust/src/lib.rs` and `Cargo.toml` prominently record
icblast's modifications. For dependencies offering Apache-2.0 as one
alternative, this distribution elects Apache-2.0, except for the generated
JavaScript template identified below, for which it elects MIT.
For dependencies offering Unlicense or MIT, it elects Unlicense. Components
available only under MIT, CC0-1.0, or the additional Unicode-3.0 terms remain
under those terms.

The root `LICENSE` contains Apache-2.0. The machine-readable
`third_party/licenses/rust/map.json` binds each locked registry crate, the
vendored patch, the exact shipped compiler source and outputs, legal material,
byte length, and SHA-256. Eight registry crates whose published archives omit
legal files are mapped to checksum-pinned legal material from their exact
source revision or to the locked parent package from the same project. The map
also identifies the Rust 1.89.0 runtime material and four outside-lock runtime
crates visible in the shipped WebAssembly. It separately identifies the
outside-lock generator template incorporated into the generated JavaScript.
Copyright, patent, trademark, and attribution notices remain the property of
their respective holders.

The bundle is reproducible with
`node scripts/generate-rust-license-bundle.mjs`. Generation verifies every
downloaded `.crate` against `didc_rust/Cargo.lock`, verifies every source
fallback and vendored file by SHA-256, rejects unknown local dependencies or
vendor files, and fails if a Rust component lacks mapped legal material.

The 123 locked registry packages have these license expressions:

- `(MIT OR Apache-2.0) AND Unicode-3.0`: 1
- `Apache-2.0`: 5
- `Apache-2.0 / MIT`: 1
- `Apache-2.0 OR MIT`: 5
- `Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT`: 1
- `Apache-2.0/MIT`: 2
- `CC0-1.0`: 1
- `MIT`: 14
- `MIT OR Apache-2.0`: 76
- `MIT/Apache-2.0`: 10
- `Unlicense OR MIT`: 5
- `Unlicense/MIT`: 2

### Vendored pretty patch

`pretty@0.12.4` is compiled from
`didc_rust/vendor/pretty-0.12.4`, not directly from the registry archive. The
baseline crates.io archive has SHA-256
`ac98773b7109bc75f475ab5a134c9b64b87e59d776d31098d8f346922396a477`
and its archived VCS metadata identifies upstream revision
`bd138e503ee3f679b26c838c9f148fbdaf6d2b7c`. icblast
balances `DocAllocator` concatenation so a large valid service cannot overflow
the WebAssembly stack while its `RcDoc` is destroyed; it also trims the vendor
manifest to the library target. Rendering output is unchanged.

The complete six-file vendor tree has SHA-256
`653e18d0e6d1c04791f4d3c3d7483e42dbb1bebea343fe6f6581bfabb804ae09`
using the format documented in the machine-readable map. The modified files
are `Cargo.toml` and `src/lib.rs`; `PATCH.md` is added; `LICENSE`,
`src/block.rs`, and `src/render.rs` match the archive. The exact upstream MIT
license is retained at `didc_rust/vendor/pretty-0.12.4/LICENSE` with SHA-256
`1f95f905a449519d5ce48bc994c01aa033375046bca261c44270e0e131adb0ef`.

The embedded WebAssembly also contains Rust standard-library material and the
outside-lock runtime crates `compiler_builtins@0.1.160`, `dlmalloc@0.2.9`,
`hashbrown@0.15.4`, and `rustc-demangle@0.1.25`. Their exact legal material is
included in the map. The Rust standard-library dependency inventory, including
its exact `library/backtrace` submodule, is covered by the official Rust 1.89.0
`COPYRIGHT-library.html` extracted from the checksum-pinned release archive.
`compiler_builtins` retains its compound MIT and
Apache-2.0-with-LLVM-exception terms, including the libm and Sun Microsystems
notices relevant to the embedded `log2` implementation.

The producer metadata also identifies wasm-bindgen `0.2.100` and walrus
`0.23.3`. The wasm-bindgen runtime family is inventoried below. The generated
JavaScript incorporates templates from
`wasm-bindgen-cli-support@0.2.100` (crates.io archive SHA-256
`21e1a4a49abe9cd6f762fc65fac2ef5732afeeb66be369d2f71a85b165a533cf`,
source revision `2405ec2b4bcd1cc4e3bd1562c373e9d5f0cbdcb5`). The map captures its exact
archive legal material, and this distribution elects MIT for those template
portions. Walrus is identified as build tooling, not as code incorporated into
the npm payload.

## Locked Rust dependency inventory

| Crate | Version | Upstream license expression | Cargo checksum |
| --- | --- | --- | --- |
| [`aho-corasick`](https://crates.io/crates/aho-corasick/1.1.3) | `1.1.3` | `Unlicense OR MIT` | `8e60d3430d3a69478ad0993f19238d2df97c507009a52b3c10addcd7f6bcb916` |
| [`anyhow`](https://crates.io/crates/anyhow/1.0.99) | `1.0.99` | `MIT OR Apache-2.0` | `b0674a1ddeecb70197781e945de4b3b8ffb61fa939a5597bcf48503737663100` |
| [`arbitrary`](https://crates.io/crates/arbitrary/1.4.2) | `1.4.2` | `MIT OR Apache-2.0` | `c3d036a3c4ab069c7b410a2ce876bd74808d2d0888a82667669f8e783a898bf1` |
| [`arrayvec`](https://crates.io/crates/arrayvec/0.5.2) | `0.5.2` | `MIT/Apache-2.0` | `23b62fc65de8e4e7f52534fb52b0f3ed04746ae267519eef2a83941e8085068b` |
| [`ascii-canvas`](https://crates.io/crates/ascii-canvas/3.0.0) | `3.0.0` | `Apache-2.0/MIT` | `8824ecca2e851cec16968d54a01dd372ef8f95b244fb84b84e70128be347c3c6` |
| [`autocfg`](https://crates.io/crates/autocfg/1.5.0) | `1.5.0` | `Apache-2.0 OR MIT` | `c08606f8c3cbf4ce6ec8e28fb0014a2c086708fe954eaa885384a6165172e7e8` |
| [`beef`](https://crates.io/crates/beef/0.5.2) | `0.5.2` | `MIT OR Apache-2.0` | `3a8241f3ebb85c056b509d4327ad0358fbbba6ffb340bf388f26350aeda225b1` |
| [`binread`](https://crates.io/crates/binread/2.2.0) | `2.2.0` | `MIT` | `16598dfc8e6578e9b597d9910ba2e73618385dc9f4b1d43dd92c349d6be6418f` |
| [`binread_derive`](https://crates.io/crates/binread_derive/2.1.0) | `2.1.0` | `MIT` | `1d9672209df1714ee804b1f4d4f68c8eb2a90b1f7a07acf472f88ce198ef1fed` |
| [`bit-set`](https://crates.io/crates/bit-set/0.5.3) | `0.5.3` | `MIT/Apache-2.0` | `0700ddab506f33b20a03b13996eccd309a48e5ff77d0d95926aa0210fb4e95f1` |
| [`bit-vec`](https://crates.io/crates/bit-vec/0.6.3) | `0.6.3` | `MIT/Apache-2.0` | `349f9b6a179ed607305526ca489b34ad0a41aed5f7980fa90eb03160b69598fb` |
| [`bitflags`](https://crates.io/crates/bitflags/2.9.3) | `2.9.3` | `MIT OR Apache-2.0` | `34efbcccd345379ca2868b2b2c9d3782e9cc58ba87bc7d79d5b53d9c9ae6f25d` |
| [`block-buffer`](https://crates.io/crates/block-buffer/0.10.4) | `0.10.4` | `MIT OR Apache-2.0` | `3078c7629b62d3f0439517fa394996acacc5cbc91c5a20d8c658e77abd503a71` |
| [`bumpalo`](https://crates.io/crates/bumpalo/3.19.0) | `3.19.0` | `MIT OR Apache-2.0` | `46c5e41b57b8bba42a04676d81cb89e9ee8e859a1a66f80a5a72e1cb76b34d43` |
| [`byteorder`](https://crates.io/crates/byteorder/1.5.0) | `1.5.0` | `Unlicense OR MIT` | `1fd0f2584146f6f2ef48085050886acf353beff7305ebd1ae69500e27c67f64b` |
| [`candid`](https://crates.io/crates/candid/0.10.17) | `0.10.17` | `Apache-2.0` | `eaac522d18020d5fbc8320ecb12a9b13b2137ae31133da2d42fa256a825507c4` |
| [`candid_derive`](https://crates.io/crates/candid_derive/0.10.17) | `0.10.17` | `Apache-2.0` | `8a1b4fddbd462182050989068d53604a91a3d0f117c3c8316c6818023df00add` |
| [`candid_parser`](https://crates.io/crates/candid_parser/0.1.4) | `0.1.4` | `Apache-2.0` | `48a3da76f989cd350b7342c64c6c6008341bb6186f6832ef04e56dc50ba0fd76` |
| [`cc`](https://crates.io/crates/cc/1.2.34) | `1.2.34` | `MIT OR Apache-2.0` | `42bc4aea80032b7bf409b0bc7ccad88853858911b7713a8062fdc0623867bedc` |
| [`cfg-if`](https://crates.io/crates/cfg-if/1.0.3) | `1.0.3` | `MIT OR Apache-2.0` | `2fd1289c04a9ea8cb22300a459a72a385d7c73d3259e2ed7dcb2af674838cfa9` |
| [`codespan-reporting`](https://crates.io/crates/codespan-reporting/0.11.1) | `0.11.1` | `Apache-2.0` | `3538270d33cc669650c4b093848450d380def10c331d38c768e34cac80576e6e` |
| [`convert_case`](https://crates.io/crates/convert_case/0.6.0) | `0.6.0` | `MIT` | `ec182b0ca2f35d8fc196cf3404988fd8b8c739a4d270ff118a398feb0cbec1ca` |
| [`cpufeatures`](https://crates.io/crates/cpufeatures/0.2.17) | `0.2.17` | `MIT OR Apache-2.0` | `59ed5838eebb26a2bb2e58f6d5b5316989ae9d08bab10e0e6d103e656d1b0280` |
| [`crc32fast`](https://crates.io/crates/crc32fast/1.5.0) | `1.5.0` | `MIT OR Apache-2.0` | `9481c1c90cbf2ac953f07c8d4a58aa3945c425b7185c9154d67a65e4230da511` |
| [`crunchy`](https://crates.io/crates/crunchy/0.2.4) | `0.2.4` | `MIT` | `460fbee9c2c2f33933d720630a6a0bac33ba7053db5344fac858d4b8952d77d5` |
| [`crypto-common`](https://crates.io/crates/crypto-common/0.1.6) | `0.1.6` | `MIT OR Apache-2.0` | `1bfb12502f3fc46cca1bb51ac28df9d618d813cdc3d2f25b9fe775a34af26bb3` |
| [`data-encoding`](https://crates.io/crates/data-encoding/2.9.0) | `2.9.0` | `MIT` | `2a2330da5de22e8a3cb63252ce2abb30116bf5265e89c0e01bc17015ce30a476` |
| [`digest`](https://crates.io/crates/digest/0.10.7) | `0.10.7` | `MIT OR Apache-2.0` | `9ed9a281f7bc9b7576e61468ba615a66a5c8cfdff42420a70aa82701a3b1e292` |
| [`dirs-next`](https://crates.io/crates/dirs-next/2.0.0) | `2.0.0` | `MIT OR Apache-2.0` | `b98cf8ebf19c3d1b223e151f99a4f9f0690dca41414773390fc824184ac833e1` |
| [`dirs-sys-next`](https://crates.io/crates/dirs-sys-next/0.1.2) | `0.1.2` | `MIT OR Apache-2.0` | `4ebda144c4fe02d1f7ea1a7d9641b6fc6b580adcfa024ae48797ecdeb6825b4d` |
| [`either`](https://crates.io/crates/either/1.15.0) | `1.15.0` | `MIT OR Apache-2.0` | `48c757948c5ede0e46177b7add2e67155f70e33c07fea8284df6576da70b3719` |
| [`ena`](https://crates.io/crates/ena/0.14.3) | `0.14.3` | `MIT OR Apache-2.0` | `3d248bdd43ce613d87415282f69b9bb99d947d290b10962dd6c56233312c2ad5` |
| [`equivalent`](https://crates.io/crates/equivalent/1.0.2) | `1.0.2` | `Apache-2.0 OR MIT` | `877a4ace8713b0bcf2a4e7eec82529c029f1d0619886d18145fea96c3ffe5c0f` |
| [`fixedbitset`](https://crates.io/crates/fixedbitset/0.4.2) | `0.4.2` | `MIT/Apache-2.0` | `0ce7134b9999ecaf8bcd65542e436736ef32ddca1b3e06094cb6ec5755203b80` |
| [`fnv`](https://crates.io/crates/fnv/1.0.7) | `1.0.7` | `Apache-2.0 / MIT` | `3f9eec918d3f24069decb9af1554cad7c880e2da24a9afd88aca000531ab82c1` |
| [`generic-array`](https://crates.io/crates/generic-array/0.14.7) | `0.14.7` | `MIT` | `85649ca51fd72272d7821adaf274ad91c288277713d9c18820d8499a7ff69e9a` |
| [`getrandom`](https://crates.io/crates/getrandom/0.2.16) | `0.2.16` | `MIT OR Apache-2.0` | `335ff9f135e4384c8150d6f27c6daed433577f86b4750418338c01a1a2528592` |
| [`hashbrown`](https://crates.io/crates/hashbrown/0.15.5) | `0.15.5` | `MIT OR Apache-2.0` | `9229cfe53dfd69f0609a49f65461bd93001ea1ef889cd5529dd176593f5338a1` |
| [`hex`](https://crates.io/crates/hex/0.4.3) | `0.4.3` | `MIT OR Apache-2.0` | `7f24254aa9a54b5c858eaee2f5bccdb46aaf0e486a595ed5fd8f86ba55232a70` |
| [`ic_principal`](https://crates.io/crates/ic_principal/0.1.1) | `0.1.1` | `Apache-2.0` | `1762deb6f7c8d8c2bdee4b6c5a47b60195b74e9b5280faa5ba29692f8e17429c` |
| [`indexmap`](https://crates.io/crates/indexmap/2.11.0) | `2.11.0` | `Apache-2.0 OR MIT` | `f2481980430f9f78649238835720ddccc57e52df14ffce1c6f37391d61b563e9` |
| [`itertools`](https://crates.io/crates/itertools/0.11.0) | `0.11.0` | `MIT OR Apache-2.0` | `b1c173a5686ce8bfa551b3563d0c2170bf24ca44da99c7ca4bfdab5418c3fe57` |
| [`js-sys`](https://crates.io/crates/js-sys/0.3.77) | `0.3.77` | `MIT OR Apache-2.0` | `1cfaf33c695fc6e08064efbc1f72ec937429614f25eef83af942d0e227c3a28f` |
| [`lalrpop`](https://crates.io/crates/lalrpop/0.20.2) | `0.20.2` | `Apache-2.0 OR MIT` | `55cb077ad656299f160924eb2912aa147d7339ea7d69e1b5517326fdcec3c1ca` |
| [`lalrpop-util`](https://crates.io/crates/lalrpop-util/0.20.2) | `0.20.2` | `Apache-2.0 OR MIT` | `507460a910eb7b32ee961886ff48539633b788a36b65692b95f225b844c82553` |
| [`lazy_static`](https://crates.io/crates/lazy_static/1.5.0) | `1.5.0` | `MIT OR Apache-2.0` | `bbd2bcb4c963f2ddae06a2efc7e9f3591312473c50c6685e1f298068316e66fe` |
| [`leb128`](https://crates.io/crates/leb128/0.2.5) | `0.2.5` | `Apache-2.0/MIT` | `884e2677b40cc8c339eaefcb701c32ef1fd2493d71118dc0ca4b6a736c93bd67` |
| [`libc`](https://crates.io/crates/libc/0.2.175) | `0.2.175` | `MIT OR Apache-2.0` | `6a82ae493e598baaea5209805c49bbf2ea7de956d50d7da0da1164f9c6d28543` |
| [`libredox`](https://crates.io/crates/libredox/0.1.9) | `0.1.9` | `MIT` | `391290121bad3d37fbddad76d8f5d1c1c314cfc646d143d7e07a3086ddff0ce3` |
| [`lock_api`](https://crates.io/crates/lock_api/0.4.13) | `0.4.13` | `MIT OR Apache-2.0` | `96936507f153605bddfcda068dd804796c84324ed2510809e5b2a624c81da765` |
| [`log`](https://crates.io/crates/log/0.4.27) | `0.4.27` | `MIT OR Apache-2.0` | `13dc2df351e3202783a1fe0d44375f7295ffb4049267b0f3018346dc122a1d94` |
| [`logos`](https://crates.io/crates/logos/0.13.0) | `0.13.0` | `MIT OR Apache-2.0` | `c000ca4d908ff18ac99b93a062cb8958d331c3220719c52e77cb19cc6ac5d2c1` |
| [`logos-codegen`](https://crates.io/crates/logos-codegen/0.13.0) | `0.13.0` | `MIT OR Apache-2.0` | `dc487311295e0002e452025d6b580b77bb17286de87b57138f3b5db711cded68` |
| [`logos-derive`](https://crates.io/crates/logos-derive/0.13.0) | `0.13.0` | `MIT OR Apache-2.0` | `dbfc0d229f1f42d790440136d941afd806bc9e949e2bcb8faa813b0f00d1267e` |
| [`memchr`](https://crates.io/crates/memchr/2.7.5) | `2.7.5` | `Unlicense OR MIT` | `32a282da65faaf38286cf3be983213fcf1d2e2a58700e808f83f4ea9a4804bc0` |
| [`new_debug_unreachable`](https://crates.io/crates/new_debug_unreachable/1.0.6) | `1.0.6` | `MIT` | `650eef8c711430f1a879fdd01d4745a7deea475becfb90269c06775983bbf086` |
| [`num-bigint`](https://crates.io/crates/num-bigint/0.4.6) | `0.4.6` | `MIT OR Apache-2.0` | `a5e44f723f1133c9deac646763579fdb3ac745e418f2a7af9cd0c431da1f20b9` |
| [`num-integer`](https://crates.io/crates/num-integer/0.1.46) | `0.1.46` | `MIT OR Apache-2.0` | `7969661fd2958a5cb096e56c8e1ad0444ac2bbcd0061bd28660485a44879858f` |
| [`num-traits`](https://crates.io/crates/num-traits/0.2.19) | `0.2.19` | `MIT OR Apache-2.0` | `071dfc062690e90b734c0b2273ce72ad0ffa95f0c74596bc250dcfd960262841` |
| [`once_cell`](https://crates.io/crates/once_cell/1.21.3) | `1.21.3` | `MIT OR Apache-2.0` | `42f5e15c9953c5e4ccceeb2e7382a716482c34515315f7b03532b8b4e8393d2d` |
| [`parking_lot`](https://crates.io/crates/parking_lot/0.12.4) | `0.12.4` | `MIT OR Apache-2.0` | `70d58bf43669b5795d1576d0641cfb6fbb2057bf629506267a92807158584a13` |
| [`parking_lot_core`](https://crates.io/crates/parking_lot_core/0.9.11) | `0.9.11` | `MIT OR Apache-2.0` | `bc838d2a56b5b1a6c25f55575dfc605fabb63bb2365f6c2353ef9159aa69e4a5` |
| [`paste`](https://crates.io/crates/paste/1.0.15) | `1.0.15` | `MIT OR Apache-2.0` | `57c0d7b74b563b49d38dae00a0c37d4d6de9b432382b2892f0574ddcae73fd0a` |
| [`petgraph`](https://crates.io/crates/petgraph/0.6.5) | `0.6.5` | `MIT OR Apache-2.0` | `b4c5cc86750666a3ed20bdaf5ca2a0344f9c67674cae0515bec2da16fbaa47db` |
| [`phf_shared`](https://crates.io/crates/phf_shared/0.11.3) | `0.11.3` | `MIT` | `67eabc2ef2a60eb7faa00097bd1ffdb5bd28e62bf39990626a582201b7a754e5` |
| [`pico-args`](https://crates.io/crates/pico-args/0.5.0) | `0.5.0` | `MIT` | `5be167a7af36ee22fe3115051bc51f6e6c7054c9348e28deb4f49bd6f705a315` |
| [`precomputed-hash`](https://crates.io/crates/precomputed-hash/0.1.1) | `0.1.1` | `MIT` | `925383efa346730478fb4838dbe9137d2a47675ad789c546d150a6e1dd4ab31c` |
| [`proc-macro2`](https://crates.io/crates/proc-macro2/1.0.101) | `1.0.101` | `MIT OR Apache-2.0` | `89ae43fd86e4158d6db51ad8e2b80f313af9cc74f5c0e03ccb87de09998732de` |
| [`psm`](https://crates.io/crates/psm/0.1.26) | `0.1.26` | `MIT OR Apache-2.0` | `6e944464ec8536cd1beb0bbfd96987eb5e3b72f2ecdafdc5c769a37f1fa2ae1f` |
| [`quote`](https://crates.io/crates/quote/1.0.40) | `1.0.40` | `MIT OR Apache-2.0` | `1885c039570dc00dcb4ff087a89e185fd56bae234ddc7f056a945bf36467248d` |
| [`redox_syscall`](https://crates.io/crates/redox_syscall/0.5.17) | `0.5.17` | `MIT` | `5407465600fb0548f1442edf71dd20683c6ed326200ace4b1ef0763521bb3b77` |
| [`redox_users`](https://crates.io/crates/redox_users/0.4.6) | `0.4.6` | `MIT` | `ba009ff324d1fc1b900bd1fdb31564febe58a8ccc8a6fdbb93b543d33b13ca43` |
| [`regex`](https://crates.io/crates/regex/1.11.2) | `1.11.2` | `MIT OR Apache-2.0` | `23d7fd106d8c02486a8d64e778353d1cffe08ce79ac2e82f540c86d0facf6912` |
| [`regex-automata`](https://crates.io/crates/regex-automata/0.4.10) | `0.4.10` | `MIT OR Apache-2.0` | `6b9458fa0bfeeac22b5ca447c63aaf45f28439a709ccd244698632f9aa6394d6` |
| [`regex-syntax`](https://crates.io/crates/regex-syntax/0.6.29) | `0.6.29` | `MIT OR Apache-2.0` | `f162c6dd7b008981e4d40210aca20b4bd0f9b60ca9271061b07f78537722f2e1` |
| [`regex-syntax`](https://crates.io/crates/regex-syntax/0.8.6) | `0.8.6` | `MIT OR Apache-2.0` | `caf4aa5b0f434c91fe5c7f1ecb6a5ece2130b02ad2a590589dda5146df959001` |
| [`rustversion`](https://crates.io/crates/rustversion/1.0.22) | `1.0.22` | `MIT OR Apache-2.0` | `b39cdef0fa800fc44525c84ccb54a029961a8215f9619753635a9c0d2538d46d` |
| [`same-file`](https://crates.io/crates/same-file/1.0.6) | `1.0.6` | `Unlicense/MIT` | `93fc1dc3aaa9bfed95e02e6eadabb4baf7e3078b0bd1b4d7b6b0b68378900502` |
| [`scopeguard`](https://crates.io/crates/scopeguard/1.2.0) | `1.2.0` | `MIT OR Apache-2.0` | `94143f37725109f92c262ed2cf5e59bce7498c01bcc1502d7b9afe439a4e9f49` |
| [`serde`](https://crates.io/crates/serde/1.0.219) | `1.0.219` | `MIT OR Apache-2.0` | `5f0e2c6ed6606019b4e29e69dbaba95b11854410e5347d525002456dbbb786b6` |
| [`serde_bytes`](https://crates.io/crates/serde_bytes/0.11.17) | `0.11.17` | `MIT OR Apache-2.0` | `8437fd221bde2d4ca316d61b90e337e9e702b3820b87d63caa9ba6c02bd06d96` |
| [`serde_derive`](https://crates.io/crates/serde_derive/1.0.219) | `1.0.219` | `MIT OR Apache-2.0` | `5b0276cf7f2c73365f7157c8123c21cd9a50fbbd844757af28ca1f5925fc2a00` |
| [`sha2`](https://crates.io/crates/sha2/0.10.9) | `0.10.9` | `MIT OR Apache-2.0` | `a7507d819769d01a365ab707794a4084392c824f54a7a6a7862f8c3d0892b283` |
| [`shlex`](https://crates.io/crates/shlex/1.3.0) | `1.3.0` | `MIT OR Apache-2.0` | `0fda2ff0d084019ba4d7c6f371c95d8fd75ce3524c3cb8fb653a3023f6323e64` |
| [`siphasher`](https://crates.io/crates/siphasher/1.0.1) | `1.0.1` | `MIT/Apache-2.0` | `56199f7ddabf13fe5074ce809e7d3f42b42ae711800501b5b16ea82ad029c39d` |
| [`smallvec`](https://crates.io/crates/smallvec/1.15.1) | `1.15.1` | `MIT OR Apache-2.0` | `67b1b7a3b5fe4f1376887184045fcf45c69e92af734b7aaddc05fb777b6fbd03` |
| [`stacker`](https://crates.io/crates/stacker/0.1.21) | `0.1.21` | `MIT OR Apache-2.0` | `cddb07e32ddb770749da91081d8d0ac3a16f1a569a18b20348cd371f5dead06b` |
| [`string_cache`](https://crates.io/crates/string_cache/0.8.9) | `0.8.9` | `MIT OR Apache-2.0` | `bf776ba3fa74f83bf4b63c3dcbbf82173db2632ed8452cb2d891d33f459de70f` |
| [`syn`](https://crates.io/crates/syn/1.0.109) | `1.0.109` | `MIT OR Apache-2.0` | `72b64191b275b66ffe2469e8af2c1cfe3bafa67b529ead792a6d0160888b4237` |
| [`syn`](https://crates.io/crates/syn/2.0.106) | `2.0.106` | `MIT OR Apache-2.0` | `ede7c438028d4436d71104916910f5bb611972c5cfd7f89b8300a8186e6fada6` |
| [`term`](https://crates.io/crates/term/0.7.0) | `0.7.0` | `MIT/Apache-2.0` | `c59df8ac95d96ff9bede18eb7300b0fda5e5d8d90960e76f8e14ae765eedbf1f` |
| [`termcolor`](https://crates.io/crates/termcolor/1.4.1) | `1.4.1` | `Unlicense OR MIT` | `06794f8f6c5c898b3275aebefa6b8a1cb24cd2c6c79397ab15774837a0bc5755` |
| [`thiserror`](https://crates.io/crates/thiserror/1.0.69) | `1.0.69` | `MIT OR Apache-2.0` | `b6aaf5339b578ea85b50e080feb250a3e8ae8cfcdff9a461c9ec2904bc923f52` |
| [`thiserror-impl`](https://crates.io/crates/thiserror-impl/1.0.69) | `1.0.69` | `MIT OR Apache-2.0` | `4fee6c4efc90059e10f81e6d42c60a18f76588c3d74cb83a0b242a2b6c7504c1` |
| [`tiny-keccak`](https://crates.io/crates/tiny-keccak/2.0.2) | `2.0.2` | `CC0-1.0` | `2c9d3793400a45f954c52e73d068316d76b6f4e36977e3fcebb13a2721e80237` |
| [`typed-arena`](https://crates.io/crates/typed-arena/2.0.2) | `2.0.2` | `MIT` | `6af6ae20167a9ece4bcb41af5b80f8a1f1df981f6391189ce00fd257af04126a` |
| [`typenum`](https://crates.io/crates/typenum/1.18.0) | `1.18.0` | `MIT OR Apache-2.0` | `1dccffe3ce07af9386bfd29e80c0ab1a8205a2fc34e4bcd40364df902cfa8f3f` |
| [`unicode-ident`](https://crates.io/crates/unicode-ident/1.0.18) | `1.0.18` | `(MIT OR Apache-2.0) AND Unicode-3.0` | `5a5f39404a5da50712a4c1eecf25e90dd62b613502b7e925fd4e4d19b5c96512` |
| [`unicode-segmentation`](https://crates.io/crates/unicode-segmentation/1.12.0) | `1.12.0` | `MIT OR Apache-2.0` | `f6ccf251212114b54433ec949fd6a7841275f9ada20dddd2f29e9ceea4501493` |
| [`unicode-width`](https://crates.io/crates/unicode-width/0.1.14) | `0.1.14` | `MIT OR Apache-2.0` | `7dd6e30e90baa6f72411720665d41d89b9a3d039dc45b8faea1ddd07f617f6af` |
| [`unicode-xid`](https://crates.io/crates/unicode-xid/0.2.6) | `0.2.6` | `MIT OR Apache-2.0` | `ebc1c04c71510c7f702b52b7c350734c9ff1295c464a03335b00bb84fc54f853` |
| [`version_check`](https://crates.io/crates/version_check/0.9.5) | `0.9.5` | `MIT/Apache-2.0` | `0b928f33d975fc6ad9f86c8f283853ad26bdd5b10b7f1542aa2fa15e2289105a` |
| [`walkdir`](https://crates.io/crates/walkdir/2.5.0) | `2.5.0` | `Unlicense/MIT` | `29790946404f91d9c5d06f9874efddea1dc06c5efe94541a7d6863108e3a5e4b` |
| [`wasi`](https://crates.io/crates/wasi/0.11.1%2Bwasi-snapshot-preview1) | `0.11.1+wasi-snapshot-preview1` | `Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT` | `ccf3ec651a847eb01de73ccad15eb7d99f80485de043efb2f370cd654f4ea44b` |
| [`wasm-bindgen`](https://crates.io/crates/wasm-bindgen/0.2.100) | `0.2.100` | `MIT OR Apache-2.0` | `1edc8929d7499fc4e8f0be2262a241556cfc54a0bea223790e71446f2aab1ef5` |
| [`wasm-bindgen-backend`](https://crates.io/crates/wasm-bindgen-backend/0.2.100) | `0.2.100` | `MIT OR Apache-2.0` | `2f0a0651a5c2bc21487bde11ee802ccaf4c51935d0d3d42a6101f98161700bc6` |
| [`wasm-bindgen-macro`](https://crates.io/crates/wasm-bindgen-macro/0.2.100) | `0.2.100` | `MIT OR Apache-2.0` | `7fe63fc6d09ed3792bd0897b314f53de8e16568c2b3f7982f468c0bf9bd0b407` |
| [`wasm-bindgen-macro-support`](https://crates.io/crates/wasm-bindgen-macro-support/0.2.100) | `0.2.100` | `MIT OR Apache-2.0` | `8ae87ea40c9f689fc23f209965b6fb8a99ad69aeeb0231408be24920604395de` |
| [`wasm-bindgen-shared`](https://crates.io/crates/wasm-bindgen-shared/0.2.100) | `0.2.100` | `MIT OR Apache-2.0` | `1a05d73b933a847d6cccdda8f838a22ff101ad9bf93e33684f39c1f5f0eece3d` |
| [`winapi`](https://crates.io/crates/winapi/0.3.9) | `0.3.9` | `MIT/Apache-2.0` | `5c839a674fcd7a98952e593242ea400abe93992746761e38641405d28b00f419` |
| [`winapi-i686-pc-windows-gnu`](https://crates.io/crates/winapi-i686-pc-windows-gnu/0.4.0) | `0.4.0` | `MIT/Apache-2.0` | `ac3b87c63620426dd9b991e5ce0329eff545bccbbb34f3be09ff6fb6ab51b7b6` |
| [`winapi-util`](https://crates.io/crates/winapi-util/0.1.10) | `0.1.10` | `Unlicense OR MIT` | `0978bf7171b3d90bac376700cb56d606feb40f251a475a5d6634613564460b22` |
| [`winapi-x86_64-pc-windows-gnu`](https://crates.io/crates/winapi-x86_64-pc-windows-gnu/0.4.0) | `0.4.0` | `MIT/Apache-2.0` | `712e227841d057c1ee1cd2fb22fa7e5a5461ae8e48fa2ca79ec42cfc1931183f` |
| [`windows-sys`](https://crates.io/crates/windows-sys/0.59.0) | `0.59.0` | `MIT OR Apache-2.0` | `1e38bc4d79ed67fd075bcc251a1c39b32a1776bbe92e5bef1f0bf1f8c531853b` |
| [`windows-targets`](https://crates.io/crates/windows-targets/0.52.6) | `0.52.6` | `MIT OR Apache-2.0` | `9b724f72796e036ab90c1021d4780d4d3d648aca59e491e6b98e725b84e99973` |
| [`windows_aarch64_gnullvm`](https://crates.io/crates/windows_aarch64_gnullvm/0.52.6) | `0.52.6` | `MIT OR Apache-2.0` | `32a4622180e7a0ec044bb555404c800bc9fd9ec262ec147edd5989ccd0c02cd3` |
| [`windows_aarch64_msvc`](https://crates.io/crates/windows_aarch64_msvc/0.52.6) | `0.52.6` | `MIT OR Apache-2.0` | `09ec2a7bb152e2252b53fa7803150007879548bc709c039df7627cabbd05d469` |
| [`windows_i686_gnu`](https://crates.io/crates/windows_i686_gnu/0.52.6) | `0.52.6` | `MIT OR Apache-2.0` | `8e9b5ad5ab802e97eb8e295ac6720e509ee4c243f69d781394014ebfe8bbfa0b` |
| [`windows_i686_gnullvm`](https://crates.io/crates/windows_i686_gnullvm/0.52.6) | `0.52.6` | `MIT OR Apache-2.0` | `0eee52d38c090b3caa76c563b86c3a4bd71ef1a819287c19d586d7334ae8ed66` |
| [`windows_i686_msvc`](https://crates.io/crates/windows_i686_msvc/0.52.6) | `0.52.6` | `MIT OR Apache-2.0` | `240948bc05c5e7c6dabba28bf89d89ffce3e303022809e73deaefe4f6ec56c66` |
| [`windows_x86_64_gnu`](https://crates.io/crates/windows_x86_64_gnu/0.52.6) | `0.52.6` | `MIT OR Apache-2.0` | `147a5c80aabfbf0c7d901cb5895d1de30ef2907eb21fbbab29ca94c5b08b1a78` |
| [`windows_x86_64_gnullvm`](https://crates.io/crates/windows_x86_64_gnullvm/0.52.6) | `0.52.6` | `MIT OR Apache-2.0` | `24d5b23dc417412679681396f2b49f3de8c1473deb516bd34410872eff51ed0d` |
| [`windows_x86_64_msvc`](https://crates.io/crates/windows_x86_64_msvc/0.52.6) | `0.52.6` | `MIT OR Apache-2.0` | `589f6da84c646204747d1270a2a5661ea66ed1cced2631d546fdfb155959f9ec` |
