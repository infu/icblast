import { Actor, HttpAgent } from "@dfinity/agent";

// Imports and re-exports candid interface
import { idlFactory } from "./aaa/aaa.did.js";
export { idlFactory } from "./aaa/aaa.did.js";
import fetch from "node-fetch";

export const canisterId = "aaaaa-aa";

export const aaaCan = (options = {}) => {
  const host = options.local
    ? options.local_host || "http://localhost:8000/"
    : "https://ic0.app";

  const agent = new HttpAgent({
    fetch,
    host,
    ...(options ? options.agentOptions : {}),
  });

  // Fetch root key for certificate validation during development
  if (options.local) {
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
    canisterId,
    ...(options ? options.actorOptions : {}),
  });
};