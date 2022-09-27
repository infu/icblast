# ICBlast

```
|_|  _.     _     _.   |_  |  _.  _ _|_
| | (_| \/ (/_   (_|   |_) | (_| _>  |_
```

# Purpose

Made for easy testing of any canisters, and maintenance scripts, including Motoko Playground canisters without manually providing interface spec.

By default works with the production IC network.

# Usage

## Simple

```
import icblast, { fileIdentity, blast } from "@infu/icblast";

let ic = icblast({ local: true });

let can = await ic("r7inp-6aaaa-aaaaa-aaabq-cai");

console.log( await can.config_get() );

```

## InternetIdentity

```
let identity = await internetIdentity();

console.log(identity.getPrincipal().toText());
```

It will open a window to InternetIdentity. It will not store the key anywhere. To be most secure, make sure your browser extensions with full permissions are set to manually activated "on click"

## Advanced

```
import icblast, { fileIdentity, blast } from "@infu/icblast";

let identityJohn = fileIdentity(0);

// TIP: Go to Motoko Playground at https://m7sm4-2iaaa-aaaab-qabra-cai.raw.ic0.app/
// Choose "Counter" and deploy it
// Take the canister id and put replace it in this code

let ic = icblast({identity : identityJohn});

let counterCanJohn = await ic("x2ojg-ciaaa-aaaab-qadba-cai");

// If you need different callers
// let identityPeter = fileIdentity(1);
// let counterCanPeter = await anycan("x2ojg-ciaaa-aaaab-qadba-cai", identityPeter);

// sends 10 requests with max concurrency 5 at a time
let results = await blast(10, 5, (idx) => {
  await delay(1);
  return counterCanJohn.get();
});
```

# Security

The outputs of didc wasm get evaluated for the purposes of creating js IDL. Which means, whatever is in there has full access to your OS and you need to trust the wasm binary. Unless you compile it on your own.

I have taken it from https://github.com/ic-rocks/didc-js and compiled it with target nodejs.

LICENSE MIT
