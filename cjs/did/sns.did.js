"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.init = exports.idlFactory = void 0;
var idlFactory = function idlFactory(_ref) {
  var IDL = _ref.IDL;
  var SnsWasmCanisterInitPayload = IDL.Record({
    access_controls_enabled: IDL.Bool,
    sns_subnet_ids: IDL.Vec(IDL.Principal)
  });
  var SnsWasm = IDL.Record({
    wasm: IDL.Vec(IDL.Nat8),
    canister_type: IDL.Int32
  });
  var AddWasmRequest = IDL.Record({
    hash: IDL.Vec(IDL.Nat8),
    wasm: IDL.Opt(SnsWasm)
  });
  var SnsWasmError = IDL.Record({
    message: IDL.Text
  });
  var Result = IDL.Variant({
    Error: SnsWasmError,
    Hash: IDL.Vec(IDL.Nat8)
  });
  var AddWasmResponse = IDL.Record({
    result: IDL.Opt(Result)
  });
  var TreasuryDistribution = IDL.Record({
    total_e8s: IDL.Nat64
  });
  var NeuronDistribution = IDL.Record({
    controller: IDL.Opt(IDL.Principal),
    stake_e8s: IDL.Nat64
  });
  var DeveloperDistribution = IDL.Record({
    developer_neurons: IDL.Vec(NeuronDistribution)
  });
  var AirdropDistribution = IDL.Record({
    airdrop_neurons: IDL.Vec(NeuronDistribution)
  });
  var SwapDistribution = IDL.Record({
    total_e8s: IDL.Nat64,
    initial_swap_amount_e8s: IDL.Nat64
  });
  var FractionalDeveloperVotingPower = IDL.Record({
    treasury_distribution: IDL.Opt(TreasuryDistribution),
    developer_distribution: IDL.Opt(DeveloperDistribution),
    airdrop_distribution: IDL.Opt(AirdropDistribution),
    swap_distribution: IDL.Opt(SwapDistribution)
  });
  var InitialTokenDistribution = IDL.Variant({
    FractionalDeveloperVotingPower: FractionalDeveloperVotingPower
  });
  var SnsInitPayload = IDL.Record({
    url: IDL.Opt(IDL.Text),
    min_participant_icp_e8s: IDL.Opt(IDL.Nat64),
    fallback_controller_principal_ids: IDL.Vec(IDL.Text),
    token_symbol: IDL.Opt(IDL.Text),
    max_icp_e8s: IDL.Opt(IDL.Nat64),
    neuron_minimum_stake_e8s: IDL.Opt(IDL.Nat64),
    logo: IDL.Opt(IDL.Text),
    name: IDL.Opt(IDL.Text),
    description: IDL.Opt(IDL.Text),
    min_participants: IDL.Opt(IDL.Nat32),
    transaction_fee_e8s: IDL.Opt(IDL.Nat64),
    initial_token_distribution: IDL.Opt(InitialTokenDistribution),
    token_name: IDL.Opt(IDL.Text),
    max_participant_icp_e8s: IDL.Opt(IDL.Nat64),
    proposal_reject_cost_e8s: IDL.Opt(IDL.Nat64),
    min_icp_e8s: IDL.Opt(IDL.Nat64)
  });
  var DeployNewSnsRequest = IDL.Record({
    sns_init_payload: IDL.Opt(SnsInitPayload)
  });
  var SnsCanisterIds = IDL.Record({
    root: IDL.Opt(IDL.Principal),
    swap: IDL.Opt(IDL.Principal),
    ledger: IDL.Opt(IDL.Principal),
    governance: IDL.Opt(IDL.Principal)
  });
  var DeployNewSnsResponse = IDL.Record({
    subnet_id: IDL.Opt(IDL.Principal),
    error: IDL.Opt(SnsWasmError),
    canisters: IDL.Opt(SnsCanisterIds)
  });
  var SnsVersion = IDL.Record({
    archive_wasm_hash: IDL.Vec(IDL.Nat8),
    root_wasm_hash: IDL.Vec(IDL.Nat8),
    swap_wasm_hash: IDL.Vec(IDL.Nat8),
    ledger_wasm_hash: IDL.Vec(IDL.Nat8),
    governance_wasm_hash: IDL.Vec(IDL.Nat8)
  });
  var GetNextSnsVersionRequest = IDL.Record({
    current_version: IDL.Opt(SnsVersion)
  });
  var GetNextSnsVersionResponse = IDL.Record({
    next_version: IDL.Opt(SnsVersion)
  });
  var GetWasmRequest = IDL.Record({
    hash: IDL.Vec(IDL.Nat8)
  });
  var GetWasmResponse = IDL.Record({
    wasm: IDL.Opt(SnsWasm)
  });
  var DeployedSns = IDL.Record({
    root_canister_id: IDL.Opt(IDL.Principal)
  });
  var ListDeployedSnsesResponse = IDL.Record({
    instances: IDL.Vec(DeployedSns)
  });
  return IDL.Service({
    add_wasm: IDL.Func([AddWasmRequest], [AddWasmResponse], []),
    deploy_new_sns: IDL.Func([DeployNewSnsRequest], [DeployNewSnsResponse], []),
    get_next_sns_version: IDL.Func([GetNextSnsVersionRequest], [GetNextSnsVersionResponse], ["query"]),
    get_wasm: IDL.Func([GetWasmRequest], [GetWasmResponse], ["query"]),
    list_deployed_snses: IDL.Func([IDL.Record({})], [ListDeployedSnsesResponse], ["query"])
  });
};
exports.idlFactory = idlFactory;
var init = function init(_ref2) {
  var IDL = _ref2.IDL;
  var SnsWasmCanisterInitPayload = IDL.Record({
    access_controls_enabled: IDL.Bool,
    sns_subnet_ids: IDL.Vec(IDL.Principal)
  });
  return [SnsWasmCanisterInitPayload];
};
exports.init = init;