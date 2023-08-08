"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.idlFactory = void 0;
var idlFactory = function idlFactory(_ref) {
  var IDL = _ref.IDL;
  return IDL.Service({
    evalScript: IDL.Func([IDL.Text], [IDL.Text], [])
  });
};
exports.idlFactory = idlFactory;