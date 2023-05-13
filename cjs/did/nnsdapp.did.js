"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.idlFactory = void 0;
var idlFactory = function idlFactory(_ref) {
  var IDL = _ref.IDL;
  var AccountIdentifier = IDL.Text;
  var SubAccount = IDL.Vec(IDL.Nat8);
  var AddPendingNotifySwapRequest = IDL.Record({
    swap_canister_id: IDL.Principal,
    buyer_sub_account: IDL.Opt(SubAccount),
    buyer: IDL.Principal
  });
  var AddPendingTransactionResponse = IDL.Variant({
    Ok: IDL.Null,
    NotAuthorized: IDL.Null
  });
  var AttachCanisterRequest = IDL.Record({
    name: IDL.Text,
    canister_id: IDL.Principal
  });
  var AttachCanisterResponse = IDL.Variant({
    Ok: IDL.Null,
    CanisterAlreadyAttached: IDL.Null,
    NameAlreadyTaken: IDL.Null,
    NameTooLong: IDL.Null,
    CanisterLimitExceeded: IDL.Null
  });
  var SubAccountDetails = IDL.Record({
    name: IDL.Text,
    sub_account: SubAccount,
    account_identifier: AccountIdentifier
  });
  var CreateSubAccountResponse = IDL.Variant({
    Ok: SubAccountDetails,
    AccountNotFound: IDL.Null,
    NameTooLong: IDL.Null,
    SubAccountLimitExceeded: IDL.Null
  });
  var DetachCanisterRequest = IDL.Record({
    canister_id: IDL.Principal
  });
  var DetachCanisterResponse = IDL.Variant({
    Ok: IDL.Null,
    CanisterNotFound: IDL.Null
  });
  var HardwareWalletAccountDetails = IDL.Record({
    principal: IDL.Principal,
    name: IDL.Text,
    account_identifier: AccountIdentifier
  });
  var AccountDetails = IDL.Record({
    principal: IDL.Principal,
    account_identifier: AccountIdentifier,
    hardware_wallet_accounts: IDL.Vec(HardwareWalletAccountDetails),
    sub_accounts: IDL.Vec(SubAccountDetails)
  });
  var GetAccountResponse = IDL.Variant({
    Ok: AccountDetails,
    AccountNotFound: IDL.Null
  });
  var CanisterDetails = IDL.Record({
    name: IDL.Text,
    canister_id: IDL.Principal
  });
  var BlockHeight = IDL.Nat64;
  var MultiPartTransactionError = IDL.Record({
    error_message: IDL.Text,
    block_height: BlockHeight
  });
  var CanisterId = IDL.Principal;
  var NeuronId = IDL.Nat64;
  var MultiPartTransactionStatus = IDL.Variant({
    Queued: IDL.Null,
    Error: IDL.Text,
    Refunded: IDL.Tuple(BlockHeight, IDL.Text),
    CanisterCreated: CanisterId,
    Complete: IDL.Null,
    NotFound: IDL.Null,
    NeuronCreated: NeuronId,
    PendingSync: IDL.Null,
    ErrorWithRefundPending: IDL.Text
  });
  var GetProposalPayloadResponse = IDL.Variant({
    Ok: IDL.Text,
    Err: IDL.Text
  });
  var Stats = IDL.Record({
    latest_transaction_block_height: BlockHeight,
    seconds_since_last_ledger_sync: IDL.Nat64,
    sub_accounts_count: IDL.Nat64,
    neurons_topped_up_count: IDL.Nat64,
    transactions_to_process_queue_length: IDL.Nat32,
    neurons_created_count: IDL.Nat64,
    hardware_wallet_accounts_count: IDL.Nat64,
    accounts_count: IDL.Nat64,
    earliest_transaction_block_height: BlockHeight,
    transactions_count: IDL.Nat64,
    block_height_synced_up_to: IDL.Opt(IDL.Nat64),
    latest_transaction_timestamp_nanos: IDL.Nat64,
    earliest_transaction_timestamp_nanos: IDL.Nat64
  });
  var GetTransactionsRequest = IDL.Record({
    page_size: IDL.Nat8,
    offset: IDL.Nat32,
    account_identifier: AccountIdentifier
  });
  var TransactionType = IDL.Variant({
    Burn: IDL.Null,
    Mint: IDL.Null,
    StakeNeuronNotification: IDL.Null,
    TopUpCanister: CanisterId,
    ParticipateSwap: CanisterId,
    CreateCanister: IDL.Null,
    Transfer: IDL.Null,
    TopUpNeuron: IDL.Null,
    StakeNeuron: IDL.Null
  });
  var Timestamp = IDL.Record({
    timestamp_nanos: IDL.Nat64
  });
  var ICPTs = IDL.Record({
    e8s: IDL.Nat64
  });
  var Send = IDL.Record({
    to: AccountIdentifier,
    fee: ICPTs,
    amount: ICPTs
  });
  var Receive = IDL.Record({
    fee: ICPTs,
    from: AccountIdentifier,
    amount: ICPTs
  });
  var Transfer = IDL.Variant({
    Burn: IDL.Record({
      amount: ICPTs
    }),
    Mint: IDL.Record({
      amount: ICPTs
    }),
    Send: Send,
    Receive: Receive
  });
  var Transaction = IDL.Record({
    transaction_type: IDL.Opt(TransactionType),
    memo: IDL.Nat64,
    timestamp: Timestamp,
    block_height: BlockHeight,
    transfer: Transfer
  });
  var GetTransactionsResponse = IDL.Record({
    total: IDL.Nat32,
    transactions: IDL.Vec(Transaction)
  });
  var HeaderField = IDL.Tuple(IDL.Text, IDL.Text);
  var HttpRequest = IDL.Record({
    url: IDL.Text,
    method: IDL.Text,
    body: IDL.Vec(IDL.Nat8),
    headers: IDL.Vec(HeaderField)
  });
  var HttpResponse = IDL.Record({
    body: IDL.Vec(IDL.Nat8),
    headers: IDL.Vec(HeaderField),
    status_code: IDL.Nat16
  });
  var RegisterHardwareWalletRequest = IDL.Record({
    principal: IDL.Principal,
    name: IDL.Text
  });
  var RegisterHardwareWalletResponse = IDL.Variant({
    Ok: IDL.Null,
    AccountNotFound: IDL.Null,
    HardwareWalletAlreadyRegistered: IDL.Null,
    HardwareWalletLimitExceeded: IDL.Null,
    NameTooLong: IDL.Null
  });
  var RenameSubAccountRequest = IDL.Record({
    new_name: IDL.Text,
    account_identifier: AccountIdentifier
  });
  var RenameSubAccountResponse = IDL.Variant({
    Ok: IDL.Null,
    AccountNotFound: IDL.Null,
    SubAccountNotFound: IDL.Null,
    NameTooLong: IDL.Null
  });
  return IDL.Service({
    add_account: IDL.Func([], [AccountIdentifier], []),
    add_pending_notify_swap: IDL.Func([AddPendingNotifySwapRequest], [AddPendingTransactionResponse], []),
    add_stable_asset: IDL.Func([IDL.Vec(IDL.Nat8)], [], []),
    attach_canister: IDL.Func([AttachCanisterRequest], [AttachCanisterResponse], []),
    create_sub_account: IDL.Func([IDL.Text], [CreateSubAccountResponse], []),
    detach_canister: IDL.Func([DetachCanisterRequest], [DetachCanisterResponse], []),
    get_account: IDL.Func([], [GetAccountResponse], ["query"]),
    get_canisters: IDL.Func([], [IDL.Vec(CanisterDetails)], ["query"]),
    get_multi_part_transaction_errors: IDL.Func([], [IDL.Vec(MultiPartTransactionError)], ["query"]),
    get_multi_part_transaction_status: IDL.Func([IDL.Principal, BlockHeight], [MultiPartTransactionStatus], ["query"]),
    get_proposal_payload: IDL.Func([IDL.Nat64], [GetProposalPayloadResponse], []),
    get_stats: IDL.Func([], [Stats], ["query"]),
    get_transactions: IDL.Func([GetTransactionsRequest], [GetTransactionsResponse], ["query"]),
    http_request: IDL.Func([HttpRequest], [HttpResponse], ["query"]),
    register_hardware_wallet: IDL.Func([RegisterHardwareWalletRequest], [RegisterHardwareWalletResponse], []),
    rename_sub_account: IDL.Func([RenameSubAccountRequest], [RenameSubAccountResponse], [])
  });
};
exports.idlFactory = idlFactory;