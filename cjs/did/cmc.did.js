"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.init = exports.idlFactory = void 0;
/* Do not edit.  Compiled with ./scripts/compile-idl-js from packages/cmc/candid/cmc.did */
var idlFactory = function idlFactory(_ref) {
  var IDL = _ref.IDL;
  var IcpXdrConversionRate = IDL.Record({
    xdr_permyriad_per_icp: IDL.Nat64,
    timestamp_seconds: IDL.Nat64
  });
  var IcpXdrConversionRateResponse = IDL.Record({
    certificate: IDL.Vec(IDL.Nat8),
    data: IcpXdrConversionRate,
    hash_tree: IDL.Vec(IDL.Nat8)
  });
  var SubnetTypesToSubnetsResponse = IDL.Record({
    data: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Vec(IDL.Principal)))
  });
  var BlockIndex = IDL.Nat64;
  var NotifyCreateCanisterArg = IDL.Record({
    controller: IDL.Principal,
    block_index: BlockIndex,
    subnet_type: IDL.Opt(IDL.Text)
  });
  var NotifyError = IDL.Variant({
    Refunded: IDL.Record({
      block_index: IDL.Opt(BlockIndex),
      reason: IDL.Text
    }),
    InvalidTransaction: IDL.Text,
    Other: IDL.Record({
      error_message: IDL.Text,
      error_code: IDL.Nat64
    }),
    Processing: IDL.Null,
    TransactionTooOld: BlockIndex
  });
  var NotifyCreateCanisterResult = IDL.Variant({
    Ok: IDL.Principal,
    Err: NotifyError
  });
  var NotifyTopUpArg = IDL.Record({
    block_index: BlockIndex,
    canister_id: IDL.Principal
  });
  var Cycles = IDL.Nat;
  var NotifyTopUpResult = IDL.Variant({
    Ok: Cycles,
    Err: NotifyError
  });
  return IDL.Service({
    get_icp_xdr_conversion_rate: IDL.Func([], [IcpXdrConversionRateResponse], ["query"]),
    get_subnet_types_to_subnets: IDL.Func([], [SubnetTypesToSubnetsResponse], ["query"]),
    notify_create_canister: IDL.Func([NotifyCreateCanisterArg], [NotifyCreateCanisterResult], []),
    notify_top_up: IDL.Func([NotifyTopUpArg], [NotifyTopUpResult], [])
  });
};
exports.idlFactory = idlFactory;
var init = function init(_ref2) {
  var IDL = _ref2.IDL;
  return [];
};
exports.init = init;