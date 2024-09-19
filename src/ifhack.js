import { Actor, HttpAgent } from "@dfinity/agent";

import { idlFactory } from "./ifhack.did.js";
export { idlFactory } from "./ifhack.did.js";

export const ifhackCanister = (canisterId, options, local = false) => {
  const agent = HttpAgent.createSync({ ...options?.agentOptions });

  // Fetch root key for certificate validation during development
  if (local) {
    agent.fetchRootKey().catch((err) => {
      console.warn(
        "Unable to fetch root key. Check to ensure that your local replica is running"
      );
      console.error(err);
    });
  }

  // Creates an actor with using the candid interface and the HttpAgent
  return Actor.createActor(idlFactory, {
    agent,
    canisterId: canisterId.toText ? canisterId.toText() : canisterId,
    ...options?.actorOptions,
  });
};
