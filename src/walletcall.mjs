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
    if (!("Ok" in response)) throw response.Err;
    return can["$" + method](response.Ok.return);
  };


  export const walletProxy = (wallet, can, cycles=0) => {
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
          if (!("Ok" in response)) throw response.Err;
          return can["$" + method](response.Ok.return);
        }
      } else proxy[prop] = can[prop];
     
    }
    return proxy;
  }