<img src="./icblast.svg" width="300">

# ICBlast client library

Used in Blast Playground
https://jglts-daaaa-aaaai-qnpma-cai.ic0.app/

# Install

`npm i @infu/icblast`

# Purpose

Convenience, Operations, maintenance, testing, exploring and learning.

Provide easy access to the Internet Computer from NodeJS & Browser.

By default works with the production IC network.

## Features

🦄 Service discovery 🦄 InternetIdentity 🦄 Proxy Calls 🦄 AgentJS 🦄 Internet Computer 🦄 Opt handled without []

Forum post: https://forum.dfinity.org/t/icblast-opinionated-client-library-undefined-or/19578

<br clear=all />

## ✨ Reasons to use

- You don't think optional values should be []
- You want serializable responses for your state
- You think Err should be thrown
- You want traversable .idl.js
- You think calls should accept your serialized values and auto convert them.
- `JS` tooling instead of `ic-repl` or `bash` scripts using `dfx`:
- As dApp maker, you already know javascript or you can’t make your frontend
- You already have all your transformation functions in JS. (AccountIdentifier, Token, etc.)
- You already got used to how AgentJs serializes objects. DFX and ic-repl use different syntax
- You can fetch something from a canister, modify and send it back easily
- You can use all the NPM libraries like ic-js, Principal, Lodash
- When testing if your canisters will upgrade well locally, you switch between git commits. You deploy the older code and switch back to the newer one, then run upgrade scripts. Your interface specs coming from files will be wrong. This fetches them from replica, so they will be the correct old ones.
- Easy for hacking one-time use scripts when there is an edge case
- You can handle asynchronicity and concurrency easily
- You value your time to be fetching the service interface specs manually, transforming them and messing with files, just to send a few calls with a script you may never run again.
- Catch and handle exceptions

# Usage

## 🦄 Simple - Node

```js
import icblast from "@infu/icblast";

let ic = icblast({ local: true }); // you can also add local_host: "http://192.168.0.100:8000"

let can = await ic("r7inp-6aaaa-aaaaa-aaabq-cai"); // It will fetch the IDL spec, no need to specify it manually

console.log(await can.config_get());
```

## Inside a browser

For production dapps it's probably a better idea to use AgentJs directly, but if you want to hack something quick or need dynamic interface generation, you can use icblast.

```js
import icblast from "@infu/icblast";

let ic = icblast({ local: true });

let can = await ic("r7inp-6aaaa-aaaaa-aaabq-cai"); // It will fetch the IDL spec, no need to specify it manually

console.log(await can.config_get());
```

## Interface definition

```js
let can = await ic("r7inp-6aaaa-aaaaa-aaabq-cai"); // it will try to get candid from meta or _if_hack
let can = await ic("r7inp-6aaaa-aaaaa-aaabq-cai", idlFactory); // it will use the object (comes from generated .idl.js)
let can = await ic(
  "r7inp-6aaaa-aaaaa-aaabq-cai",
  "https://raw.githubusercontent.com/dfinity/ic-js/main/packages/sns/candid/sns_governance.did"
); // it will fetch it and transpile and use it
let can = await ic(
  "r7inp-6aaaa-aaaaa-aaabq-cai",
  "https://raw.githubusercontent.com/dfinity/ic-js/main/packages/sns/candid/sns_governance.idl.js"
); // it will fetch and use it
let can = await ic("r7inp-6aaaa-aaaaa-aaabq-cai", text_did); // it will transpile and use it
```

## Explainer

If you want traversable interface (Perhaps making a browser)

```js
import { explainer } from "@infu/icblast";
explainer(idlFactory);
```

## toState

You want to store responses in your state

```js
import { toState } from "@infu/icblast";

toState(myobj);
```

## 🌈 InternetIdentity

```js
let identity = await internetIdentity();

console.log(identity.getPrincipal().toText());
```

It will open a window to InternetIdentity. It will not store the key anywhere. To be most secure, make sure your browser extensions with full permissions are set to manually activated "on click"

## 🍭 fileIdentity, hashIdentity and concurrent async calls

```js
import icblast, { fileIdentity } from "@infu/icblast";

// stores your private keys in a json file in ~/.icblast/identity.json
// you have 10 identites you can switch 0-9
let identityJohn = fileIdentity(0);
// In browsers you can use hashIdentity('a secret that will get hashed')

// TIP: Go to Motoko Playground at https://m7sm4-2iaaa-aaaab-qabra-cai.raw.ic0.app/
// Choose "Counter" and deploy it
// Take the canister id and put replace it in this code

let ic = icblast({identity : identityJohn});

let counterCanJohn = await ic("x2ojg-ciaaa-aaaab-qadba-cai");

// sends 10 requests with max concurrency 5 at a time
let results = await blast(10, 5, (idx) => {
  await delay(1);
  return counterCanJohn.get();
});
```

## 🎠 Wallet calls (easy)

```js
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

// or

let res = await walletProxy(wallet, aaa).canister_status({
  canister_id: Principal.fromText("kbzti-laaaa-aaaai-qe2ma-cai"),
});

// or

let res = await walletProxy(wallet, aaa, 100000).canister_status({
  canister_id: Principal.fromText("kbzti-laaaa-aaaai-qe2ma-cai"),
});
```

## 🐉 Wallet calls (verbose) - useful when making your own proxy canisters

```js
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
let decoded = aaa.$canister_status(response.Ok.return);

console.log(decoded);
```

## 🏳️‍🌈 File uploads

```js
// Deploy a canister and take the canister_id
// from this playground: https://m7sm4-2iaaa-aaaab-qabra-cai.raw.ic0.app/?tag=1212716285
let canister_id = "6zfvq-kiaaa-aaaab-qacra-cai";

let ic = icblast();
let can = await ic(canister_id);

await can.put(await file("./testfile.bin"));

let fetched_file = await can.get();

console.log(fetched_file);
```

LICENSE MIT ☮️
