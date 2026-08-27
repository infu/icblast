# icblast patch to pretty 0.12.4

This directory vendors the library source and exact MIT license from
`pretty` 0.12.4. The upstream crates.io archive has SHA-256
`ac98773b7109bc75f475ab5a134c9b64b87e59d776d31098d8f346922396a477`
and corresponds to upstream revision
`bd138e503ee3f679b26c838c9f148fbdaf6d2b7c`.

icblast changes `DocAllocator::concat` to build a balanced `Append` tree and
routes `DocAllocator::intersperse` through it. Rendering order and output are
unchanged. The logarithmic tree depth prevents recursive `RcDoc` destruction
from overflowing a WebAssembly call stack for large valid Candid services.

The vendored manifest omits upstream development-only targets and dependencies;
the library dependencies and feature remain unchanged.
