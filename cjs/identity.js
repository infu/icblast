"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.fileIdentity = exports.MAX_IDENTITIES = void 0;
var _path = _interopRequireDefault(require("path"));
var _identity = _interopRequireDefault(require("@dfinity/identity"));
var _fs = _interopRequireDefault(require("fs"));
var _os = _interopRequireDefault(require("os"));
var _getRandomValues = _interopRequireDefault(require("get-random-values"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }
var MAX_IDENTITIES = 10;
exports.MAX_IDENTITIES = MAX_IDENTITIES;
var newIdentity = function newIdentity() {
  var entropy = (0, _getRandomValues["default"])(new Uint8Array(32));
  var identity = _identity["default"].Ed25519KeyIdentity.generate(entropy);
  return identity;
};
var fileContents = null;
var fileIdentity = function fileIdentity(num) {
  if (num >= MAX_IDENTITIES) throw new Error("increase MAX identities");
  var dir = _os["default"].homedir() + "/.icblast/";
  var fn = _path["default"].resolve(dir, "identity.json");
  if (fileContents === null) try {
    fileContents = JSON.parse(_fs["default"].readFileSync(fn));
  } catch (e) {
    console.log("Creating new identity and saving it in identity.json");
    fileContents = [];
    for (var i = 0; i < MAX_IDENTITIES; i++) {
      fileContents[i] = newIdentity();
    }
    fileContents = JSON.parse(JSON.stringify(fileContents));
    _fs["default"].mkdir(dir, function (err) {
      _fs["default"].writeFileSync(fn, JSON.stringify(fileContents));
    });
  }
  return _identity["default"].Ed25519KeyIdentity.fromParsedJson(fileContents[num]);
};
exports.fileIdentity = fileIdentity;