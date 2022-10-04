import { AuthClient } from "@dfinity/auth-client";

let client = null;

const auth = {
  client,
};

auth.create = async () => {
  auth.client = await AuthClient.create();
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
      ...(process.env.REACT_APP_IDENTITY_PROVIDER
        ? { identityProvider: process.env.REACT_APP_IDENTITY_PROVIDER }
        : {}),
      onSuccess: async (e) => {
        resolve();
      },
      onError: reject,
    });
  });
};

export const InternetIdentity = auth;
