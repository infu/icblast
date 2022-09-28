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
    return can["$" + method](Buffer.from(response.Ok.return));
  };
