/**
 * Maps buf.validate annotations to Zod validation chains
 *
 * This module reads the buf.validate.field extension from proto descriptors
 * and converts them to Zod validation method chains.
 */

import type { DescField } from "@bufbuild/protobuf";
import { hasOption, getOption } from "@bufbuild/protobuf";
import { field as fieldExtension, type FieldRules, type StringRules, type Int32Rules, type Int64Rules, type EnumRules } from "./buf-validate/validate_pb.js";

export interface ValidationChain {
  /** Zod methods to chain, e.g., [".min(1)", ".max(100)", ".email()"] */
  methods: string[];
  /** Whether the field is required (affects optional handling) */
  required: boolean;
  /** Whether enum should filter out UNSPECIFIED (value 0) */
  enumDefinedOnly: boolean;
}

/**
 * Extracts buf.validate constraints from a field and returns Zod validation chain
 */
export function getValidationChain(field: DescField): ValidationChain {
  const chain: ValidationChain = {
    methods: [],
    required: false,
    enumDefinedOnly: false,
  };

  // Check if field has buf.validate.field option
  if (!hasOption(field, fieldExtension)) {
    return chain;
  }

  const rules = getOption(field, fieldExtension);

  // Handle required field
  if (rules.required) {
    chain.required = true;
  }

  // Handle type-specific rules based on the oneof case
  if (rules.type.case === "string") {
    applyStringRules(rules.type.value, chain);
  } else if (rules.type.case === "int32") {
    applyInt32Rules(rules.type.value, chain);
  } else if (rules.type.case === "int64") {
    applyInt64Rules(rules.type.value, chain);
  } else if (rules.type.case === "uint32") {
    applyUint32Rules(rules.type.value, chain);
  } else if (rules.type.case === "uint64") {
    applyUint64Rules(rules.type.value, chain);
  } else if (rules.type.case === "enum") {
    applyEnumRules(rules.type.value, chain);
  }

  return chain;
}

/**
 * Apply string validation rules to the chain
 */
function applyStringRules(rules: StringRules, chain: ValidationChain): void {
  // min_len -> .min()
  if (rules.minLen !== undefined && rules.minLen > 0n) {
    chain.methods.push(`.min(${rules.minLen})`);
  }

  // max_len -> .max()
  if (rules.maxLen !== undefined && rules.maxLen > 0n) {
    chain.methods.push(`.max(${rules.maxLen})`);
  }

  // len -> .length()
  if (rules.len !== undefined && rules.len > 0n) {
    chain.methods.push(`.length(${rules.len})`);
  }

  // pattern -> .regex()
  if (rules.pattern) {
    // Escape the pattern for use in a regex literal
    const escapedPattern = rules.pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    chain.methods.push(`.regex(new RegExp("${escapedPattern}"))`);
  }

  // Well-known string types
  if (rules.wellKnown.case === "email" && rules.wellKnown.value === true) {
    chain.methods.push(".email()");
  } else if (rules.wellKnown.case === "uuid" && rules.wellKnown.value === true) {
    chain.methods.push(".uuid()");
  } else if (rules.wellKnown.case === "uri" && rules.wellKnown.value === true) {
    chain.methods.push(".url()");
  } else if (rules.wellKnown.case === "ipv4" && rules.wellKnown.value === true) {
    chain.methods.push(".ip({ version: 'v4' })");
  } else if (rules.wellKnown.case === "ipv6" && rules.wellKnown.value === true) {
    chain.methods.push(".ip({ version: 'v6' })");
  } else if (rules.wellKnown.case === "ip" && rules.wellKnown.value === true) {
    chain.methods.push(".ip()");
  }

  // prefix -> .startsWith()
  if (rules.prefix) {
    chain.methods.push(`.startsWith("${escapeString(rules.prefix)}")`);
  }

  // suffix -> .endsWith()
  if (rules.suffix) {
    chain.methods.push(`.endsWith("${escapeString(rules.suffix)}")`);
  }

  // contains -> .includes()
  if (rules.contains) {
    chain.methods.push(`.includes("${escapeString(rules.contains)}")`);
  }
}

/**
 * Apply int32 validation rules to the chain
 */
function applyInt32Rules(rules: Int32Rules, chain: ValidationChain): void {
  applyNumericRules(rules, chain);
}

/**
 * Apply int64 validation rules to the chain
 */
function applyInt64Rules(rules: Int64Rules, chain: ValidationChain): void {
  applyNumericRules(rules, chain);
}

/**
 * Apply uint32 validation rules to the chain
 */
function applyUint32Rules(rules: { gt?: number; gte?: number; lt?: number; lte?: number; const?: number }, chain: ValidationChain): void {
  applyNumericRules(rules, chain);
}

/**
 * Apply uint64 validation rules to the chain
 */
function applyUint64Rules(rules: { gt?: bigint; gte?: bigint; lt?: bigint; lte?: bigint; const?: bigint }, chain: ValidationChain): void {
  applyNumericRules(rules, chain);
}

/**
 * Apply numeric validation rules (works for int32, int64, uint32, uint64, float, double)
 */
function applyNumericRules(
  rules: { gt?: number | bigint; gte?: number | bigint; lt?: number | bigint; lte?: number | bigint; const?: number | bigint },
  chain: ValidationChain
): void {
  // gt -> .gt()
  if (rules.gt !== undefined) {
    chain.methods.push(`.gt(${rules.gt})`);
  }

  // gte -> .gte() (or .min() for integers)
  if (rules.gte !== undefined) {
    chain.methods.push(`.gte(${rules.gte})`);
  }

  // lt -> .lt()
  if (rules.lt !== undefined) {
    chain.methods.push(`.lt(${rules.lt})`);
  }

  // lte -> .lte() (or .max() for integers)
  if (rules.lte !== undefined) {
    chain.methods.push(`.lte(${rules.lte})`);
  }
}

/**
 * Apply enum validation rules to the chain
 */
function applyEnumRules(rules: EnumRules, chain: ValidationChain): void {
  // defined_only -> filter out UNSPECIFIED (0)
  if (rules.definedOnly) {
    chain.enumDefinedOnly = true;
  }
}

/**
 * Escape a string for use in generated code
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * Check if a field is marked as required via buf.validate
 */
export function isFieldRequired(field: DescField): boolean {
  if (!hasOption(field, fieldExtension)) {
    return false;
  }
  const rules = getOption(field, fieldExtension);
  return rules.required === true;
}

/**
 * Check if an enum field should exclude UNSPECIFIED value
 */
export function shouldExcludeEnumUnspecified(field: DescField): boolean {
  if (!hasOption(field, fieldExtension)) {
    return false;
  }
  const rules = getOption(field, fieldExtension);
  if (rules.type.case === "enum") {
    return rules.type.value.definedOnly === true;
  }
  return false;
}
