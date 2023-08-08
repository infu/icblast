"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.init = exports.idlFactory = void 0;
var idlFactory = function idlFactory(_ref) {
  var IDL = _ref.IDL;
  var AccountIdentifier = IDL.Vec(IDL.Nat8);
  var AccountBalanceArgs = IDL.Record({
    account: AccountIdentifier
  });
  var Tokens = IDL.Record({
    e8s: IDL.Nat64
  });
  var Archive = IDL.Record({
    canister_id: IDL.Principal
  });
  var Archives = IDL.Record({
    archives: IDL.Vec(Archive)
  });
  var BlockIndex = IDL.Nat64;
  var GetBlocksArgs = IDL.Record({
    start: BlockIndex,
    length: IDL.Nat64
  });
  var Memo = IDL.Nat64;
  var Operation = IDL.Variant({
    Burn: IDL.Record({
      from: AccountIdentifier,
      amount: Tokens
    }),
    Mint: IDL.Record({
      to: AccountIdentifier,
      amount: Tokens
    }),
    Transfer: IDL.Record({
      to: AccountIdentifier,
      fee: Tokens,
      from: AccountIdentifier,
      amount: Tokens
    })
  });
  var TimeStamp = IDL.Record({
    timestamp_nanos: IDL.Nat64
  });
  var Transaction = IDL.Record({
    memo: Memo,
    operation: IDL.Opt(Operation),
    created_at_time: TimeStamp
  });
  var Block = IDL.Record({
    transaction: Transaction,
    timestamp: TimeStamp,
    parent_hash: IDL.Opt(IDL.Vec(IDL.Nat8))
  });
  var BlockRange = IDL.Record({
    blocks: IDL.Vec(Block)
  });
  var QueryArchiveError = IDL.Variant({
    BadFirstBlockIndex: IDL.Record({
      requested_index: BlockIndex,
      first_valid_index: BlockIndex
    }),
    Other: IDL.Record({
      error_message: IDL.Text,
      error_code: IDL.Nat64
    })
  });
  var QueryArchiveResult = IDL.Variant({
    Ok: BlockRange,
    Err: QueryArchiveError
  });
  var QueryArchiveFn = IDL.Func([GetBlocksArgs], [QueryArchiveResult], ["query"]);
  var QueryBlocksResponse = IDL.Record({
    certificate: IDL.Opt(IDL.Vec(IDL.Nat8)),
    blocks: IDL.Vec(Block),
    chain_length: IDL.Nat64,
    first_block_index: BlockIndex,
    archived_blocks: IDL.Vec(IDL.Record({
      callback: QueryArchiveFn,
      start: BlockIndex,
      length: IDL.Nat64
    }))
  });
  var SubAccount = IDL.Vec(IDL.Nat8);
  var TransferArgs = IDL.Record({
    to: AccountIdentifier,
    fee: Tokens,
    memo: Memo,
    from_subaccount: IDL.Opt(SubAccount),
    created_at_time: IDL.Opt(TimeStamp),
    amount: Tokens
  });
  var TransferError = IDL.Variant({
    TxTooOld: IDL.Record({
      allowed_window_nanos: IDL.Nat64
    }),
    BadFee: IDL.Record({
      expected_fee: Tokens
    }),
    TxDuplicate: IDL.Record({
      duplicate_of: BlockIndex
    }),
    TxCreatedInFuture: IDL.Null,
    InsufficientFunds: IDL.Record({
      balance: Tokens
    })
  });
  var TransferResult = IDL.Variant({
    Ok: BlockIndex,
    Err: TransferError
  });
  var TransferFeeArg = IDL.Record({});
  var TransferFee = IDL.Record({
    transfer_fee: Tokens
  });
  return IDL.Service({
    account_balance: IDL.Func([AccountBalanceArgs], [Tokens], ["query"]),
    archives: IDL.Func([], [Archives], ["query"]),
    decimals: IDL.Func([], [IDL.Record({
      decimals: IDL.Nat32
    })], ["query"]),
    name: IDL.Func([], [IDL.Record({
      name: IDL.Text
    })], ["query"]),
    query_blocks: IDL.Func([GetBlocksArgs], [QueryBlocksResponse], ["query"]),
    symbol: IDL.Func([], [IDL.Record({
      symbol: IDL.Text
    })], ["query"]),
    transfer: IDL.Func([TransferArgs], [TransferResult], []),
    transfer_fee: IDL.Func([TransferFeeArg], [TransferFee], ["query"])
  });
};
exports.idlFactory = idlFactory;
var init = function init(_ref2) {
  var IDL = _ref2.IDL;
  return [];
};
exports.init = init;