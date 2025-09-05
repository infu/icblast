export const WASM_BASE64 = ;
export function wasmBytes(): Uint8Array {
  const bin = atob(WASM_BASE64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
