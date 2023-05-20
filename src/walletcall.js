export const walletCall =
  (wallet, can, method, cycles = 0) =>
  async (...arg) => {
    let encoded = can[method + "$"](...arg);

    let response = await wallet.wallet_call({
      args: encoded,
      cycles,
      method_name: method,
      canister: can.$principal,
    });
    return can["$" + method](response.return)[0];
  };

export const walletProxy = (wallet, can, cycles = 0) => {
  const proxy = {};
  for (let prop in can) {
    if (typeof can[prop] == "function") {
      const method = prop;
      proxy[prop] = async (...arg) => {
        let encoded = can[method + "$"](...arg);

        let response = await wallet.wallet_call({
          args: encoded,
          cycles,
          method_name: method,
          canister: can.$principal,
        });
        return can["$" + method](response.return)[0];
      };
    } else proxy[prop] = can[prop];
  }
  return proxy;
};
