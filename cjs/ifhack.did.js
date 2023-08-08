"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.init = exports.idlFactory = void 0;
var idlFactory = function idlFactory(_ref) {
  var IDL = _ref.IDL;
  return IDL.Service({
    __get_candid_interface_tmp_hack: IDL.Func([], [IDL.Text], ["query"])
  });
};
exports.idlFactory = idlFactory;
var init = function init(_ref2) {
  var IDL = _ref2.IDL;
  return [];
};
exports.init = init;