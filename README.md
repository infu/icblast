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

## fileIdentity and concurrent async calls

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

## Wallet calls (easy)

```
let identity = await fileIdentity(0);
console.log(identity.getPrincipal().toText());

// Note: This won't work unless the wallet is the controller of the canister you are checking
// the status of. Also won't work if you don't have the current identity added as controller in
// the wallet canister.

let ic = icblast({ identity }); // can switch identity or go local

let aaa = await ic("aaaaa-aa", "ic");
let wallet = await ic("vlgg5-pyaaa-aaaai-qaqba-cai", "wallet");

let res = await walletCall(
  wallet,
  aaa,
  "canister_status",
  0 // you can also send cycles. Used when creating canisters
)({ canister_id: Principal.fromText("kbzti-laaaa-aaaai-qe2ma-cai") });

```

## Wallet calls (verbose) - useful when making your own proxy canisters

```
let ic = icblast({ identity }); // can switch identity or go local

// we need to specify "ic" preset because this canister doesn't support downloading IDL spec
let aaa = await ic("aaaaa-aa", "ic");

// each method has also a version with $ suffix. It will not make a call but return the encoded arguments.
// Useful for proxy calls
let encoded = aaa.canister_status$({
  canister_id: Principal.fromText("kbzti-laaaa-aaaai-qe2ma-cai"),
});

// we need to specify "wallet" preset for this canister as well
let wallet = await ic("vlgg5-pyaaa-aaaai-qaqba-cai", "wallet");

// now we make a wallet proxy call
let response = await wallet.wallet_call({
  args: encoded,
  cycles: 0,
  method_name: "canister_status",
  canister: Principal.fromText("aaaaa-aa"),
});

// each method has also version with $ prefix. It will decode responses
let decoded = aaa.$canister_status(Buffer.from(response.Ok.return));

console.log(decoded);
```

# Security

The outputs of didc wasm get evaluated for the purposes of creating js IDL. Which means, whatever is in there has full access to your OS and you need to trust the wasm binary. Unless you compile it on your own.

I have taken it from https://github.com/ic-rocks/didc-js and compiled it with target nodejs.

LICENSE MIT
