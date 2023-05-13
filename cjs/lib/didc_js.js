"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var imports = {};
imports["__wbindgen_placeholder__"] = module.exports;
var wasm;
var _require = require("util"),
  TextDecoder = _require.TextDecoder,
  TextEncoder = _require.TextEncoder;
var cachedTextDecoder = new TextDecoder("utf-8", {
  ignoreBOM: true,
  fatal: true
});
cachedTextDecoder.decode();
var cachegetUint8Memory0 = null;
function getUint8Memory0() {
  if (cachegetUint8Memory0 === null || cachegetUint8Memory0.buffer !== wasm.memory.buffer) {
    cachegetUint8Memory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachegetUint8Memory0;
}
function getStringFromWasm0(ptr, len) {
  return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}
var cachegetInt32Memory0 = null;
function getInt32Memory0() {
  if (cachegetInt32Memory0 === null || cachegetInt32Memory0.buffer !== wasm.memory.buffer) {
    cachegetInt32Memory0 = new Int32Array(wasm.memory.buffer);
  }
  return cachegetInt32Memory0;
}
var WASM_VECTOR_LEN = 0;
var cachedTextEncoder = new TextEncoder("utf-8");
var encodeString = typeof cachedTextEncoder.encodeInto === "function" ? function (arg, view) {
  return cachedTextEncoder.encodeInto(arg, view);
} : function (arg, view) {
  var buf = cachedTextEncoder.encode(arg);
  view.set(buf);
  return {
    read: arg.length,
    written: buf.length
  };
};
function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === undefined) {
    var buf = cachedTextEncoder.encode(arg);
    var _ptr = malloc(buf.length);
    getUint8Memory0().subarray(_ptr, _ptr + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return _ptr;
  }
  var len = arg.length;
  var ptr = malloc(len);
  var mem = getUint8Memory0();
  var offset = 0;
  for (; offset < len; offset++) {
    var code = arg.charCodeAt(offset);
    if (code > 0x7f) break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3);
    var view = getUint8Memory0().subarray(ptr + offset, ptr + len);
    var ret = encodeString(arg, view);
    offset += ret.written;
  }
  WASM_VECTOR_LEN = offset;
  return ptr;
}
/**
 * @param {string} prog
 * @returns {Bindings | undefined}
 */
module.exports.generate = function (prog) {
  var ptr0 = passStringToWasm0(prog, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  var len0 = WASM_VECTOR_LEN;
  var ret = wasm.generate(ptr0, len0);
  return ret === 0 ? undefined : Bindings.__wrap(ret);
};

/**
 */
var Bindings = /*#__PURE__*/function () {
  function Bindings() {
    _classCallCheck(this, Bindings);
  }
  _createClass(Bindings, [{
    key: "__destroy_into_raw",
    value: function __destroy_into_raw() {
      var ptr = this.ptr;
      this.ptr = 0;
      return ptr;
    }
  }, {
    key: "free",
    value: function free() {
      var ptr = this.__destroy_into_raw();
      wasm.__wbg_bindings_free(ptr);
    }
    /**
     * @returns {string}
     */
  }, {
    key: "js",
    get: function get() {
      try {
        var retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.bindings_js(retptr, this.ptr);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        return getStringFromWasm0(r0, r1);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_free(r0, r1);
      }
    }
    /**
     * @returns {string}
     */
  }, {
    key: "ts",
    get: function get() {
      try {
        var retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.bindings_ts(retptr, this.ptr);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        return getStringFromWasm0(r0, r1);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_free(r0, r1);
      }
    }
    /**
     * @returns {string}
     */
  }, {
    key: "motoko",
    get: function get() {
      try {
        var retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.bindings_motoko(retptr, this.ptr);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        return getStringFromWasm0(r0, r1);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_free(r0, r1);
      }
    }
  }], [{
    key: "__wrap",
    value: function __wrap(ptr) {
      var obj = Object.create(Bindings.prototype);
      obj.ptr = ptr;
      return obj;
    }
  }]);
  return Bindings;
}();
module.exports.Bindings = Bindings;
module.exports.__wbindgen_throw = function (arg0, arg1) {
  throw new Error(getStringFromWasm0(arg0, arg1));
};
var path = require("path").join(__dirname, "didc_js_bg.wasm");
var bytes = require("fs").readFileSync(path);
var wasmModule = new WebAssembly.Module(bytes);
var wasmInstance = new WebAssembly.Instance(wasmModule, imports);
wasm = wasmInstance.exports;
module.exports.__wasm = wasm;