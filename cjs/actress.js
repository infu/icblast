"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.xVec = exports.xVariant = exports.xTuple = exports.xTime = exports.xText = exports.xRecord = exports.xRec = exports.xPrincipal = exports.xOpt = exports.xNull = exports.xNat8 = exports.xNat64 = exports.xNat32 = exports.xNat16 = exports.xNat = exports.xInt8 = exports.xInt64 = exports.xInt32 = exports.xInt16 = exports.xInt = exports.xFloat = exports.xBool = exports.xBigInt = exports.xBase = exports.wrapActor = exports.toState = exports.explainer = void 0;
var _candid = require("@dfinity/candid");
var _principal = require("@dfinity/principal");
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _iterableToArrayLimit(arr, i) { var _i = null == arr ? null : "undefined" != typeof Symbol && arr[Symbol.iterator] || arr["@@iterator"]; if (null != _i) { var _s, _e, _x, _r, _arr = [], _n = !0, _d = !1; try { if (_x = (_i = _i.call(arr)).next, 0 === i) { if (Object(_i) !== _i) return; _n = !1; } else for (; !(_n = (_s = _x.call(_i)).done) && (_arr.push(_s.value), _arr.length !== i); _n = !0); } catch (err) { _d = !0, _e = err; } finally { try { if (!_n && null != _i["return"] && (_r = _i["return"](), Object(_r) !== _r)) return; } finally { if (_d) throw _e; } } return _arr; } }
function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }
function _createForOfIteratorHelper(o, allowArrayLike) { var it = typeof Symbol !== "undefined" && o[Symbol.iterator] || o["@@iterator"]; if (!it) { if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") { if (it) o = it; var i = 0; var F = function F() {}; return { s: F, n: function n() { if (i >= o.length) return { done: true }; return { done: false, value: o[i++] }; }, e: function e(_e2) { throw _e2; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var normalCompletion = true, didErr = false, err; return { s: function s() { it = it.call(o); }, n: function n() { var step = it.next(); normalCompletion = step.done; return step; }, e: function e(_e3) { didErr = true; err = _e3; }, f: function f() { try { if (!normalCompletion && it["return"] != null) it["return"](); } finally { if (didErr) throw err; } } }; }
function _regeneratorRuntime() { "use strict"; /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE */ _regeneratorRuntime = function _regeneratorRuntime() { return exports; }; var exports = {}, Op = Object.prototype, hasOwn = Op.hasOwnProperty, defineProperty = Object.defineProperty || function (obj, key, desc) { obj[key] = desc.value; }, $Symbol = "function" == typeof Symbol ? Symbol : {}, iteratorSymbol = $Symbol.iterator || "@@iterator", asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator", toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag"; function define(obj, key, value) { return Object.defineProperty(obj, key, { value: value, enumerable: !0, configurable: !0, writable: !0 }), obj[key]; } try { define({}, ""); } catch (err) { define = function define(obj, key, value) { return obj[key] = value; }; } function wrap(innerFn, outerFn, self, tryLocsList) { var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator, generator = Object.create(protoGenerator.prototype), context = new Context(tryLocsList || []); return defineProperty(generator, "_invoke", { value: makeInvokeMethod(innerFn, self, context) }), generator; } function tryCatch(fn, obj, arg) { try { return { type: "normal", arg: fn.call(obj, arg) }; } catch (err) { return { type: "throw", arg: err }; } } exports.wrap = wrap; var ContinueSentinel = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} var IteratorPrototype = {}; define(IteratorPrototype, iteratorSymbol, function () { return this; }); var getProto = Object.getPrototypeOf, NativeIteratorPrototype = getProto && getProto(getProto(values([]))); NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol) && (IteratorPrototype = NativeIteratorPrototype); var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype); function defineIteratorMethods(prototype) { ["next", "throw", "return"].forEach(function (method) { define(prototype, method, function (arg) { return this._invoke(method, arg); }); }); } function AsyncIterator(generator, PromiseImpl) { function invoke(method, arg, resolve, reject) { var record = tryCatch(generator[method], generator, arg); if ("throw" !== record.type) { var result = record.arg, value = result.value; return value && "object" == _typeof(value) && hasOwn.call(value, "__await") ? PromiseImpl.resolve(value.__await).then(function (value) { invoke("next", value, resolve, reject); }, function (err) { invoke("throw", err, resolve, reject); }) : PromiseImpl.resolve(value).then(function (unwrapped) { result.value = unwrapped, resolve(result); }, function (error) { return invoke("throw", error, resolve, reject); }); } reject(record.arg); } var previousPromise; defineProperty(this, "_invoke", { value: function value(method, arg) { function callInvokeWithMethodAndArg() { return new PromiseImpl(function (resolve, reject) { invoke(method, arg, resolve, reject); }); } return previousPromise = previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg(); } }); } function makeInvokeMethod(innerFn, self, context) { var state = "suspendedStart"; return function (method, arg) { if ("executing" === state) throw new Error("Generator is already running"); if ("completed" === state) { if ("throw" === method) throw arg; return doneResult(); } for (context.method = method, context.arg = arg;;) { var delegate = context.delegate; if (delegate) { var delegateResult = maybeInvokeDelegate(delegate, context); if (delegateResult) { if (delegateResult === ContinueSentinel) continue; return delegateResult; } } if ("next" === context.method) context.sent = context._sent = context.arg;else if ("throw" === context.method) { if ("suspendedStart" === state) throw state = "completed", context.arg; context.dispatchException(context.arg); } else "return" === context.method && context.abrupt("return", context.arg); state = "executing"; var record = tryCatch(innerFn, self, context); if ("normal" === record.type) { if (state = context.done ? "completed" : "suspendedYield", record.arg === ContinueSentinel) continue; return { value: record.arg, done: context.done }; } "throw" === record.type && (state = "completed", context.method = "throw", context.arg = record.arg); } }; } function maybeInvokeDelegate(delegate, context) { var methodName = context.method, method = delegate.iterator[methodName]; if (undefined === method) return context.delegate = null, "throw" === methodName && delegate.iterator["return"] && (context.method = "return", context.arg = undefined, maybeInvokeDelegate(delegate, context), "throw" === context.method) || "return" !== methodName && (context.method = "throw", context.arg = new TypeError("The iterator does not provide a '" + methodName + "' method")), ContinueSentinel; var record = tryCatch(method, delegate.iterator, context.arg); if ("throw" === record.type) return context.method = "throw", context.arg = record.arg, context.delegate = null, ContinueSentinel; var info = record.arg; return info ? info.done ? (context[delegate.resultName] = info.value, context.next = delegate.nextLoc, "return" !== context.method && (context.method = "next", context.arg = undefined), context.delegate = null, ContinueSentinel) : info : (context.method = "throw", context.arg = new TypeError("iterator result is not an object"), context.delegate = null, ContinueSentinel); } function pushTryEntry(locs) { var entry = { tryLoc: locs[0] }; 1 in locs && (entry.catchLoc = locs[1]), 2 in locs && (entry.finallyLoc = locs[2], entry.afterLoc = locs[3]), this.tryEntries.push(entry); } function resetTryEntry(entry) { var record = entry.completion || {}; record.type = "normal", delete record.arg, entry.completion = record; } function Context(tryLocsList) { this.tryEntries = [{ tryLoc: "root" }], tryLocsList.forEach(pushTryEntry, this), this.reset(!0); } function values(iterable) { if (iterable) { var iteratorMethod = iterable[iteratorSymbol]; if (iteratorMethod) return iteratorMethod.call(iterable); if ("function" == typeof iterable.next) return iterable; if (!isNaN(iterable.length)) { var i = -1, next = function next() { for (; ++i < iterable.length;) if (hasOwn.call(iterable, i)) return next.value = iterable[i], next.done = !1, next; return next.value = undefined, next.done = !0, next; }; return next.next = next; } } return { next: doneResult }; } function doneResult() { return { value: undefined, done: !0 }; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, defineProperty(Gp, "constructor", { value: GeneratorFunctionPrototype, configurable: !0 }), defineProperty(GeneratorFunctionPrototype, "constructor", { value: GeneratorFunction, configurable: !0 }), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, "GeneratorFunction"), exports.isGeneratorFunction = function (genFun) { var ctor = "function" == typeof genFun && genFun.constructor; return !!ctor && (ctor === GeneratorFunction || "GeneratorFunction" === (ctor.displayName || ctor.name)); }, exports.mark = function (genFun) { return Object.setPrototypeOf ? Object.setPrototypeOf(genFun, GeneratorFunctionPrototype) : (genFun.__proto__ = GeneratorFunctionPrototype, define(genFun, toStringTagSymbol, "GeneratorFunction")), genFun.prototype = Object.create(Gp), genFun; }, exports.awrap = function (arg) { return { __await: arg }; }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, asyncIteratorSymbol, function () { return this; }), exports.AsyncIterator = AsyncIterator, exports.async = function (innerFn, outerFn, self, tryLocsList, PromiseImpl) { void 0 === PromiseImpl && (PromiseImpl = Promise); var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl); return exports.isGeneratorFunction(outerFn) ? iter : iter.next().then(function (result) { return result.done ? result.value : iter.next(); }); }, defineIteratorMethods(Gp), define(Gp, toStringTagSymbol, "Generator"), define(Gp, iteratorSymbol, function () { return this; }), define(Gp, "toString", function () { return "[object Generator]"; }), exports.keys = function (val) { var object = Object(val), keys = []; for (var key in object) keys.push(key); return keys.reverse(), function next() { for (; keys.length;) { var key = keys.pop(); if (key in object) return next.value = key, next.done = !1, next; } return next.done = !0, next; }; }, exports.values = values, Context.prototype = { constructor: Context, reset: function reset(skipTempReset) { if (this.prev = 0, this.next = 0, this.sent = this._sent = undefined, this.done = !1, this.delegate = null, this.method = "next", this.arg = undefined, this.tryEntries.forEach(resetTryEntry), !skipTempReset) for (var name in this) "t" === name.charAt(0) && hasOwn.call(this, name) && !isNaN(+name.slice(1)) && (this[name] = undefined); }, stop: function stop() { this.done = !0; var rootRecord = this.tryEntries[0].completion; if ("throw" === rootRecord.type) throw rootRecord.arg; return this.rval; }, dispatchException: function dispatchException(exception) { if (this.done) throw exception; var context = this; function handle(loc, caught) { return record.type = "throw", record.arg = exception, context.next = loc, caught && (context.method = "next", context.arg = undefined), !!caught; } for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i], record = entry.completion; if ("root" === entry.tryLoc) return handle("end"); if (entry.tryLoc <= this.prev) { var hasCatch = hasOwn.call(entry, "catchLoc"), hasFinally = hasOwn.call(entry, "finallyLoc"); if (hasCatch && hasFinally) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } else if (hasCatch) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); } else { if (!hasFinally) throw new Error("try statement without catch or finally"); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } } } }, abrupt: function abrupt(type, arg) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) { var finallyEntry = entry; break; } } finallyEntry && ("break" === type || "continue" === type) && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc && (finallyEntry = null); var record = finallyEntry ? finallyEntry.completion : {}; return record.type = type, record.arg = arg, finallyEntry ? (this.method = "next", this.next = finallyEntry.finallyLoc, ContinueSentinel) : this.complete(record); }, complete: function complete(record, afterLoc) { if ("throw" === record.type) throw record.arg; return "break" === record.type || "continue" === record.type ? this.next = record.arg : "return" === record.type ? (this.rval = this.arg = record.arg, this.method = "return", this.next = "end") : "normal" === record.type && afterLoc && (this.next = afterLoc), ContinueSentinel; }, finish: function finish(finallyLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.finallyLoc === finallyLoc) return this.complete(entry.completion, entry.afterLoc), resetTryEntry(entry), ContinueSentinel; } }, "catch": function _catch(tryLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc === tryLoc) { var record = entry.completion; if ("throw" === record.type) { var thrown = record.arg; resetTryEntry(entry); } return thrown; } } throw new Error("illegal catch attempt"); }, delegateYield: function delegateYield(iterable, resultName, nextLoc) { return this.delegate = { iterator: values(iterable), resultName: resultName, nextLoc: nextLoc }, "next" === this.method && (this.arg = undefined), ContinueSentinel; } }, exports; }
function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }
function _iterableToArray(iter) { if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) return Array.from(iter); }
function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) return _arrayLikeToArray(arr); }
function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i]; return arr2; }
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }
function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); Object.defineProperty(subClass, "prototype", { writable: false }); if (superClass) _setPrototypeOf(subClass, superClass); }
function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }
function _createSuper(Derived) { var hasNativeReflectConstruct = _isNativeReflectConstruct(); return function _createSuperInternal() { var Super = _getPrototypeOf(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = _getPrototypeOf(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return _possibleConstructorReturn(this, result); }; }
function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } else if (call !== void 0) { throw new TypeError("Derived constructors may only return object or undefined"); } return _assertThisInitialized(self); }
function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }
function _isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }
function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var xBase = /*#__PURE__*/function () {
  function xBase(obj) {
    _classCallCheck(this, xBase);
    this.val = obj;
  }
  _createClass(xBase, null, [{
    key: "fromState",
    value: function fromState(v) {
      return v;
    }
  }]);
  return xBase;
}();
exports.xBase = xBase;
var xBigInt = /*#__PURE__*/function () {
  function xBigInt(obj) {
    _classCallCheck(this, xBigInt);
    this.val = obj;
  }
  _createClass(xBigInt, null, [{
    key: "fromState",
    value: function fromState(v) {
      if (typeof v === "string") return BigInt(v);else return v;
    }
  }]);
  return xBigInt;
}();
exports.xBigInt = xBigInt;
var xText = /*#__PURE__*/function (_xBase) {
  _inherits(xText, _xBase);
  var _super = _createSuper(xText);
  function xText(obj) {
    _classCallCheck(this, xText);
    return _super.call(this, obj);
  }
  return _createClass(xText);
}(xBase);
exports.xText = xText;
var xVec = /*#__PURE__*/function (_xBase2) {
  _inherits(xVec, _xBase2);
  var _super2 = _createSuper(xVec);
  function xVec(obj) {
    _classCallCheck(this, xVec);
    return _super2.call(this, obj);
  }
  _createClass(xVec, [{
    key: "fromState",
    value: function fromState(v) {
      if (this.val.name === "xNat8") {
        if (typeof v === "string" && isHexString(v)) {
          return hexStringToUint8Array(v);
        }
      }
      return v;
    }
  }]);
  return xVec;
}(xBase);
exports.xVec = xVec;
var xOpt = /*#__PURE__*/function (_xBase3) {
  _inherits(xOpt, _xBase3);
  var _super3 = _createSuper(xOpt);
  function xOpt(obj) {
    _classCallCheck(this, xOpt);
    return _super3.call(this, obj);
  }
  return _createClass(xOpt);
}(xBase);
exports.xOpt = xOpt;
var xVariant = /*#__PURE__*/function (_xBase4) {
  _inherits(xVariant, _xBase4);
  var _super4 = _createSuper(xVariant);
  function xVariant(obj) {
    _classCallCheck(this, xVariant);
    return _super4.call(this, obj);
  }
  return _createClass(xVariant);
}(xBase);
exports.xVariant = xVariant;
var xNull = /*#__PURE__*/function (_xBase5) {
  _inherits(xNull, _xBase5);
  var _super5 = _createSuper(xNull);
  function xNull(obj) {
    _classCallCheck(this, xNull);
    return _super5.call(this, obj);
  }
  return _createClass(xNull);
}(xBase);
exports.xNull = xNull;
var xPrincipal = /*#__PURE__*/function (_xBase6) {
  _inherits(xPrincipal, _xBase6);
  var _super6 = _createSuper(xPrincipal);
  function xPrincipal(obj) {
    _classCallCheck(this, xPrincipal);
    return _super6.call(this, obj);
  }
  _createClass(xPrincipal, null, [{
    key: "fromState",
    value: function fromState(v) {
      if (typeof v === "string") return _principal.Principal.from(v);else return v;
    }
  }]);
  return xPrincipal;
}(xBase);
exports.xPrincipal = xPrincipal;
var xNat8 = /*#__PURE__*/function (_xBase7) {
  _inherits(xNat8, _xBase7);
  var _super7 = _createSuper(xNat8);
  function xNat8(obj) {
    _classCallCheck(this, xNat8);
    return _super7.call(this, obj);
  }
  return _createClass(xNat8);
}(xBase);
exports.xNat8 = xNat8;
var xNat16 = /*#__PURE__*/function (_xBase8) {
  _inherits(xNat16, _xBase8);
  var _super8 = _createSuper(xNat16);
  function xNat16(obj) {
    _classCallCheck(this, xNat16);
    return _super8.call(this, obj);
  }
  return _createClass(xNat16);
}(xBase);
exports.xNat16 = xNat16;
var xNat32 = /*#__PURE__*/function (_xBase9) {
  _inherits(xNat32, _xBase9);
  var _super9 = _createSuper(xNat32);
  function xNat32(obj) {
    _classCallCheck(this, xNat32);
    return _super9.call(this, obj);
  }
  return _createClass(xNat32);
}(xBase);
exports.xNat32 = xNat32;
var xInt8 = /*#__PURE__*/function (_xBase10) {
  _inherits(xInt8, _xBase10);
  var _super10 = _createSuper(xInt8);
  function xInt8(obj) {
    _classCallCheck(this, xInt8);
    return _super10.call(this, obj);
  }
  return _createClass(xInt8);
}(xBase);
exports.xInt8 = xInt8;
var xInt16 = /*#__PURE__*/function (_xBase11) {
  _inherits(xInt16, _xBase11);
  var _super11 = _createSuper(xInt16);
  function xInt16(obj) {
    _classCallCheck(this, xInt16);
    return _super11.call(this, obj);
  }
  return _createClass(xInt16);
}(xBase);
exports.xInt16 = xInt16;
var xInt32 = /*#__PURE__*/function (_xBase12) {
  _inherits(xInt32, _xBase12);
  var _super12 = _createSuper(xInt32);
  function xInt32(obj) {
    _classCallCheck(this, xInt32);
    return _super12.call(this, obj);
  }
  return _createClass(xInt32);
}(xBase); // start bigint
exports.xInt32 = xInt32;
var xNat64 = /*#__PURE__*/function (_xBigInt) {
  _inherits(xNat64, _xBigInt);
  var _super13 = _createSuper(xNat64);
  function xNat64(obj) {
    _classCallCheck(this, xNat64);
    return _super13.call(this, obj);
  }
  return _createClass(xNat64);
}(xBigInt);
exports.xNat64 = xNat64;
var xInt64 = /*#__PURE__*/function (_xBigInt2) {
  _inherits(xInt64, _xBigInt2);
  var _super14 = _createSuper(xInt64);
  function xInt64(obj) {
    _classCallCheck(this, xInt64);
    return _super14.call(this, obj);
  }
  return _createClass(xInt64);
}(xBigInt);
exports.xInt64 = xInt64;
var xNat = /*#__PURE__*/function (_xBigInt3) {
  _inherits(xNat, _xBigInt3);
  var _super15 = _createSuper(xNat);
  function xNat(obj) {
    _classCallCheck(this, xNat);
    return _super15.call(this, obj);
  }
  return _createClass(xNat);
}(xBigInt);
exports.xNat = xNat;
var xInt = /*#__PURE__*/function (_xBigInt4) {
  _inherits(xInt, _xBigInt4);
  var _super16 = _createSuper(xInt);
  function xInt(obj) {
    _classCallCheck(this, xInt);
    return _super16.call(this, obj);
  }
  return _createClass(xInt);
}(xBigInt);
exports.xInt = xInt;
var xTime = /*#__PURE__*/function (_xBigInt5) {
  _inherits(xTime, _xBigInt5);
  var _super17 = _createSuper(xTime);
  function xTime(obj) {
    _classCallCheck(this, xTime);
    return _super17.call(this, obj);
  }
  return _createClass(xTime);
}(xBigInt); // end bigint
exports.xTime = xTime;
var xFloat = /*#__PURE__*/function (_xBase13) {
  _inherits(xFloat, _xBase13);
  var _super18 = _createSuper(xFloat);
  function xFloat(obj) {
    _classCallCheck(this, xFloat);
    return _super18.call(this, obj);
  }
  return _createClass(xFloat);
}(xBase);
exports.xFloat = xFloat;
var xBool = /*#__PURE__*/function (_xBase14) {
  _inherits(xBool, _xBase14);
  var _super19 = _createSuper(xBool);
  function xBool(obj) {
    _classCallCheck(this, xBool);
    return _super19.call(this, obj);
  }
  return _createClass(xBool);
}(xBase);
exports.xBool = xBool;
var xRecord = /*#__PURE__*/function (_xBase15) {
  _inherits(xRecord, _xBase15);
  var _super20 = _createSuper(xRecord);
  function xRecord(obj) {
    _classCallCheck(this, xRecord);
    return _super20.call(this, obj);
  }
  return _createClass(xRecord);
}(xBase);
exports.xRecord = xRecord;
var xTuple = /*#__PURE__*/function (_xBase16) {
  _inherits(xTuple, _xBase16);
  var _super21 = _createSuper(xTuple);
  function xTuple(obj) {
    _classCallCheck(this, xTuple);
    return _super21.call(this, obj);
  }
  return _createClass(xTuple);
}(xBase);
exports.xTuple = xTuple;
var xRec = /*#__PURE__*/function (_xBase17) {
  _inherits(xRec, _xBase17);
  var _super22 = _createSuper(xRec);
  function xRec(obj) {
    _classCallCheck(this, xRec);
    return _super22.call(this, obj);
  }
  _createClass(xRec, [{
    key: "fill",
    value: function fill(newInstance) {
      Object.setPrototypeOf(this, newInstance.constructor.prototype);
      Object.assign(this, newInstance);
    }
  }]);
  return xRec;
}(xBase);
exports.xRec = xRec;
var IDLExplainer = /*#__PURE__*/function () {
  function IDLExplainer() {
    _classCallCheck(this, IDLExplainer);
    _defineProperty(this, "Text", xText);
    _defineProperty(this, "Null", xNull);
    _defineProperty(this, "Principal", xPrincipal);
    _defineProperty(this, "Nat8", xNat8);
    _defineProperty(this, "Nat16", xNat16);
    _defineProperty(this, "Nat32", xNat32);
    _defineProperty(this, "Nat64", xNat64);
    _defineProperty(this, "Nat", xNat);
    _defineProperty(this, "Int8", xInt8);
    _defineProperty(this, "Int16", xInt16);
    _defineProperty(this, "Int32", xInt32);
    _defineProperty(this, "Int64", xInt64);
    _defineProperty(this, "Int", xInt);
    _defineProperty(this, "Float", xFloat);
    _defineProperty(this, "Bool", xBool);
    _defineProperty(this, "Time", xTime);
  }
  _createClass(IDLExplainer, [{
    key: "Service",
    value: function Service(o) {
      return o;
    }
  }, {
    key: "Func",
    value: function Func(arg, ret, _) {
      return {
        input: arg,
        output: ret
      };
    }
  }, {
    key: "Record",
    value: function Record(o) {
      return new xRecord(o);
    }
  }, {
    key: "Tuple",
    value: function Tuple() {
      for (var _len = arguments.length, o = new Array(_len), _key = 0; _key < _len; _key++) {
        o[_key] = arguments[_key];
      }
      return new xTuple(o);
    }
  }, {
    key: "Rec",
    value: function Rec() {
      return new xRec();
    }
  }, {
    key: "Vec",
    value: function Vec(o) {
      return new xVec(o);
    }
  }, {
    key: "Variant",
    value: function Variant(o) {
      return new xVariant(o);
    }
  }, {
    key: "Opt",
    value: function Opt(a) {
      return new xOpt(a);
    }
  }]);
  return IDLExplainer;
}();
var IDLWalker = new IDLExplainer();
var explainer = function explainer(idlFactory) {
  return idlFactory({
    IDL: IDLWalker
  });
};
exports.explainer = explainer;
function convert(input, def) {
  function convertRecursive(ekey, input, def) {
    try {
      if (def instanceof xOpt) {
        if (input === undefined) return [];
        if (input === null) return null;
        return [convertRecursive("(opt)", input, def.val)];
      } else if (def instanceof xVec) {
        input = def.fromState(input);
        if (ArrayBuffer.isView(input) || input instanceof ArrayBuffer) return input;
        if (!Array.isArray(input)) {
          throw "(array expected)";
        }
        return input.map(function (item, idx) {
          return convertRecursive(idx, item, def.val);
        });
      } else if (def instanceof xTuple) {
        if (!Array.isArray(input)) {
          throw "(array expected)";
        }
        return input.map(function (item, idx) {
          return convertRecursive(idx, item, def.val[idx]);
        });
      } else if (def instanceof xVariant) {
        var key = Object.keys(input)[0];
        return _defineProperty({}, key, convertRecursive(key, input[key], def.val[key]));
      } else if (def instanceof xRecord) {
        var _output = {};
        for (var _key2 in def.val) {
          var opt = def.val[_key2] instanceof xOpt;
          if (!input.hasOwnProperty(_key2)) {
            if (!opt) throw "".concat(_key2, " (missing)");else _output[_key2] = [];
          } else _output[_key2] = convertRecursive(_key2, input[_key2], def.val[_key2]);
        }
        return _output;
      } else {
        return def.fromState(input);
      }
    } catch (e) {
      throw ekey + "." + e;
    }
  }
  var output = input.map(function (item, idx) {
    return convertRecursive("arg" + idx, item, def[idx]);
  });
  return output;
}
function convertBack(input, def) {
  function convertBackRecursive(ekey, input, def) {
    try {
      if (def instanceof xOpt) {
        if (input === null) return null;
        if (input.length === 0) return undefined;
        return convertBackRecursive("(opt)", input[0], def.val);
      } else if (def instanceof xVec) {
        if (ArrayBuffer.isView(input) || input instanceof ArrayBuffer) return input;
        if (!Array.isArray(input)) {
          throw "(array expected)";
        }
        return input.map(function (item, idx) {
          return convertBackRecursive(idx, item, def.val);
        });
      } else if (def instanceof xTuple) {
        if (!Array.isArray(input)) {
          throw "(array expected)";
        }
        return input.map(function (item, idx) {
          return convertBackRecursive(idx, item, def.val[idx]);
        });
      } else if (def instanceof xVariant) {
        var key = Object.keys(input)[0];
        return _defineProperty({}, key, convertBackRecursive(key, input[key], def.val[key]));
      } else if (def instanceof xRecord) {
        var _output2 = {};
        for (var _key3 in def.val) {
          var opt = def.val[_key3] instanceof xOpt;
          if (!input.hasOwnProperty(_key3)) {
            if (!opt) throw "".concat(_key3, " (missing)");
          } else {
            var value = convertBackRecursive(_key3, input[_key3], def.val[_key3]);
            if (value !== null) {
              _output2[_key3] = value;
            }
          }
        }
        return _output2;
      } else {
        return input;
      }
    } catch (e) {
      throw ekey + "." + e;
    }
  }
  var output = convertBackRecursive("ret", input, def !== null ? def[0] : true);
  if (def[0] && def[0] instanceof xVariant && "Ok" in def[0].val && "Err" in def[0].val && Object.keys(def[0].val).length == 2) {
    if ("Ok" in output) return output.Ok;else throw output.Err;
  }
  return output;
}
var wrapFunction = function wrapFunction(fn, key, xdl) {
  return /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee() {
    var _len2,
      args,
      _key4,
      processedArgs,
      result,
      cc,
      _args = arguments;
    return _regeneratorRuntime().wrap(function _callee$(_context) {
      while (1) switch (_context.prev = _context.next) {
        case 0:
          for (_len2 = _args.length, args = new Array(_len2), _key4 = 0; _key4 < _len2; _key4++) {
            args[_key4] = _args[_key4];
          }
          processedArgs = convert(args, xdl[key].input);
          _context.next = 4;
          return fn.apply(void 0, _toConsumableArray(processedArgs));
        case 4:
          result = _context.sent;
          cc = convertBack(result, xdl[key].output);
          return _context.abrupt("return", cc);
        case 7:
        case "end":
          return _context.stop();
      }
    }, _callee);
  }));
};
var wrapActor = function wrapActor(obj, idlFactory) {
  var xdl = explainer(idlFactory);
  var wrappedObject = {};
  for (var key in obj) {
    if (typeof obj[key] === "function") {
      wrappedObject[key] = wrapFunction(obj[key], key, xdl);
    } else {
      wrappedObject[key] = obj[key];
    }
  }
  attachEncoders(wrappedObject, idlFactory, xdl);
  return wrappedObject;
};
exports.wrapActor = wrapActor;
var attachEncoders = function attachEncoders(target, idlFactory, xdl) {
  var service = idlFactory({
    IDL: _candid.IDL
  });
  var _iterator = _createForOfIteratorHelper(service._fields),
    _step;
  try {
    var _loop = function _loop() {
      var _step$value = _slicedToArray(_step.value, 2),
        methodName = _step$value[0],
        func = _step$value[1];
      target[methodName + "$"] = function () {
        for (var _len3 = arguments.length, args = new Array(_len3), _key5 = 0; _key5 < _len3; _key5++) {
          args[_key5] = arguments[_key5];
        }
        return _toConsumableArray(_candid.IDL.encode(func.argTypes, convert(args, xdl[methodName].input)));
      };
      target["$" + methodName] = function (payload) {
        return convertBack(_candid.IDL.decode(func.retTypes, Buffer.from(payload)), xdl[methodName].output[0]);
      };
    };
    for (_iterator.s(); !(_step = _iterator.n()).done;) {
      _loop();
    }
  } catch (err) {
    _iterator.e(err);
  } finally {
    _iterator.f();
  }
};
var toState = function toState(x) {
  if (x === undefined || x === null) return x;
  if (typeof x === "bigint") return x.toString();
  if (x instanceof Uint8Array) return uint8ArrayToHexString(x);
  if (x instanceof Uint16Array) return Array.from(x);
  if (x instanceof Int16Array) return Array.from(x);
  if (x instanceof Uint32Array) return Array.from(x);
  if (x instanceof Int32Array) return Array.from(x);
  if (x instanceof BigInt64Array) return Array.from(x, function (bigInt) {
    return bigInt.toString();
  });
  if (x instanceof BigUint64Array) return Array.from(x, function (bigInt) {
    return bigInt.toString();
  });
  if (ArrayBuffer.isView(x) || x instanceof ArrayBuffer) return _toConsumableArray(x);
  if (Array.isArray(x)) {
    return x.map(function (y) {
      return toState(y);
    });
  }
  if (_typeof(x) === "object") {
    var _x$constructor;
    if (((_x$constructor = x.constructor) === null || _x$constructor === void 0 ? void 0 : _x$constructor.name) === "Principal") return x.toText();
    return Object.fromEntries(Object.keys(x).map(function (k) {
      return [k, toState(x[k])];
    }));
  }
  return x;
};
exports.toState = toState;
function isHexString(str) {
  return /^[0-9a-fA-F]+$/.test(str);
}
function hexStringToUint8Array(hexString) {
  if (hexString.length % 2 !== 0) {
    throw new Error("Invalid hex string length.");
  }
  var numBytes = hexString.length / 2;
  var uint8Array = new Uint8Array(numBytes);
  for (var i = 0; i < numBytes; i++) {
    var byteValue = parseInt(hexString.slice(i * 2, i * 2 + 2), 16);
    uint8Array[i] = byteValue;
  }
  return uint8Array;
}
function uint8ArrayToHexString(uint8Array) {
  var hexString = "";
  for (var i = 0; i < uint8Array.length; i++) {
    var byteValue = uint8Array[i];
    var byteHex = byteValue.toString(16).padStart(2, "0");
    hexString += byteHex;
  }
  return hexString;
}