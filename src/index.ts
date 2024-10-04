//Exports all handler functions
export * from "./mappings/mappingHandlers";

// Workaround to fix BigInt serialization issue
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};
