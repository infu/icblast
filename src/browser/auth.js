import { AuthClient } from "@dfinity/auth-client";

let client = null;

const auth = {
  client,
};

auth.create = async () => {
  auth.client = await AuthClient.create({
    idleOptions: {
      disableIdle: true,
      //idleTimeout: 1000 * 60 * 30, // set to 30 minutes
      // disableDefaultIdleCallback: true // disable the default reload behavior
    },
  });
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
auth.getPrincipal = () => auth.client.getIdentity()?.getPrincipal();
auth.isAuthenticated = () => auth.client.isAuthenticated();
auth.logout = () => auth.client.logout();

auth.login = () => {
  return new Promise(async (resolve, reject) => {
    auth.client.login({
      //maxTimeToLive: BigInt(90 * 24 * 60 * 60 * 1000 * 1000 * 1000),
      maxTimeToLive: BigInt(90 * 24 * 60 * 60 * 1000 * 1000 * 1000),

      ...(process.env.REACT_APP_IDENTITY_PROVIDER
        ? { identityProvider: process.env.REACT_APP_IDENTITY_PROVIDER }
        : {}),
      idleTimeout: 1000 * 60 * 30,
      onSuccess: async (e) => {
        resolve();
      },
      onError: reject,
    });
  });
};

export const InternetIdentity = auth;
