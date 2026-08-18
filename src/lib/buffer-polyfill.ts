import { Buffer } from "buffer";

// @ton/core and TON Connect expect a Node-style Buffer global in the browser.
const globalScope = globalThis as typeof globalThis & { Buffer?: typeof Buffer; global?: unknown };

if (!globalScope.Buffer) {
  globalScope.Buffer = Buffer;
}
if (!globalScope.global) {
  globalScope.global = globalScope;
}

export {};
