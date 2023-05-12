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

auth.getIdentity = () => auth.client.getIdentity();
auth.getPrincipal = () => auth.client.getIdentity()?.getPrincipal();
auth.isAuthenticated = () => auth.client.isAuthenticated();
auth.logout = () => auth.client.logout();

auth.login = (opts = {}) => {
  return new Promise(async (resolve, reject) => {
    auth.client.login({
      //maxTimeToLive: BigInt(90 * 24 * 60 * 60 * 1000 * 1000 * 1000),
      maxTimeToLive: BigInt(90 * 24 * 60 * 60 * 1000 * 1000 * 1000),

      ...opts,
      idleTimeout: 1000 * 60 * 30,
      onSuccess: async (e) => {
        resolve();
      },
      onError: reject,
    });
  });
};

export const InternetIdentity = auth;
