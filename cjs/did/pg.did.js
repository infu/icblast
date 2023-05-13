"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.init = exports.idlFactory = void 0;
var idlFactory = function idlFactory(_ref) {
  var IDL = _ref.IDL;
  return IDL.Service({
    binding: IDL.Func([IDL.Text, IDL.Text], [IDL.Opt(IDL.Text)], ["query"]),
    did_to_js: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ["query"]),
    subtype: IDL.Func([IDL.Text, IDL.Text], [IDL.Variant({
      Ok: IDL.Null,
      Err: IDL.Text
    })], ["query"])
  });
};
exports.idlFactory = idlFactory;
var init = function init(_ref2) {
  var IDL = _ref2.IDL;
  return [];
};
exports.init = init;