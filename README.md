# icblast

# Purpose
Made so I can easily test my canisters and Motoko Playground canisters without manually providing interface spec.
If you use too high concurrency you may get IP blocked by gateways.
By default works with production IC network.
You can also make it work with your local replica if you specify NODE_ENV=development and IC_HOST in .env

Easy as:
```
let output = await(await anycan("x2ojg-ciaaa-aaaab-qadba-cai")).anyfunc(input);
```

# Usage

```
import { anycan, fileIdentity, blast } from "./sys/index.js";

let identityJohn = fileIdentity(0);

// TIP: Go to Motoko Playground at https://m7sm4-2iaaa-aaaab-qabra-cai.raw.ic0.app/
// Choose "Counter" and deploy it
// Take the canister id and put replace it in this code

let counterCanJohn = await anycan("x2ojg-ciaaa-aaaab-qadba-cai", identityJohn);

// If you need different callers
// let identityPeter = fileIdentity(1);
// let counterCanPeter = await anycan("x2ojg-ciaaa-aaaab-qadba-cai", identityPeter);

// sends 10 requests with max concurrency 5 at a time
let results = await blast(10, 5, (idx) => {
  return counterCanJohn.get();
});
```

# Security

The outputs of didc wasm get evaluated for the purposes of creating js IDL. Which means, whatever is in there has full access to your OS and you need to trust the wasm binary.
I have taken it from https://github.com/ic-rocks/didc-js and compiled it with target nodejs.
You can compile it for yourself and replace the current wasm binary.
