import { AuthClient } from "@dfinity/auth-client";

let client = null;

const auth = {
  client,
};

auth.create = async () => {
  const storage = new MyStorage();

  auth.client = await AuthClient.create({ storage });
  return auth;
};

auth.getAgentOptions = async () => {
  let identity = auth.client.getIdentity();

  return {
    identity: identity,
    host: process.env.REACT_APP_IC_GATEWAY || "https://ic0.app",
  };
};

auth.getIdentity = () => auth.client.getIdentity();
auth.getPrincipal = () => auth.client.getIdentity().getPrincipal();

class MyStorage {
  constructor() {}

  async get(key) {
    return null;
  }

  async set(key, value) {}

  async remove(key) {}
}

export const AnonymousIdentity = auth;
