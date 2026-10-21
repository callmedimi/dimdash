/**
 * DimDash v2 In-House Schema Validator
 * Universal (Node.js & Browser), Zero External Dependencies, <= 250 lines
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashSchema = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  function safeClone(obj, depth = 0) {
    if (depth > 15) return null;
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(v => safeClone(v, depth + 1));
    const out = {};
    for (const k of Object.keys(obj)) {
      if (!DANGEROUS_KEYS.has(k)) {
        out[k] = safeClone(obj[k], depth + 1);
      }
    }
    return out;
  }

  function validate(schema, data, options = {}) {
    const errors = [];
    const unknownPolicy = options.unknownPolicy || schema.unknownPolicy || 'keep'; // 'strip' | 'reject' | 'keep'
    const maxNesting = options.maxNesting || 6;
    const maxItems = options.maxItems || 5000;

    function inspectDepth(val, path, depth) {
      if (depth > maxNesting) {
        errors.push({ path, msg: `Nesting depth exceeds maximum allowed (${maxNesting})` });
        return false;
      }
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (let i = 0; i < val.length; i++) {
            if (!inspectDepth(val[i], `${path}[${i}]`, depth + 1)) return false;
          }
        } else {
          for (const k of Object.keys(val)) {
            if (!inspectDepth(val[k], path ? `${path}.${k}` : k, depth + 1)) return false;
          }
        }
      }
      return true;
    }

    if (!inspectDepth(data, '', 0)) {
      return { ok: false, errors, value: data };
    }

    function check(rule, val, path, depth) {
      if (depth > maxNesting) {
        errors.push({ path, msg: `Nesting depth exceeds maximum allowed (${maxNesting})` });
        return undefined;
      }

      if (val === undefined || val === null) {
        if (rule.required) {
          errors.push({ path, msg: `Field is required` });
        }
        return val !== undefined ? val : (rule.default !== undefined ? rule.default : undefined);
      }

      // Type check
      if (rule.type) {
        const actualType = Array.isArray(val) ? 'array' : typeof val;
        if (rule.type === 'integer') {
          if (typeof val !== 'number' || !Number.isInteger(val)) {
            errors.push({ path, msg: `Expected integer, got ${actualType}` });
            return val;
          }
        } else if (actualType !== rule.type) {
          errors.push({ path, msg: `Expected ${rule.type}, got ${actualType}` });
          return val;
        }
      }

      // Enums
      if (rule.enum && !rule.enum.includes(val)) {
        errors.push({ path, msg: `Value must be one of: ${rule.enum.join(', ')}` });
      }

      // Number range
      if (typeof val === 'number') {
        if (rule.min !== undefined && val < rule.min) {
          errors.push({ path, msg: `Value must be >= ${rule.min}` });
        }
        if (rule.max !== undefined && val > rule.max) {
          errors.push({ path, msg: `Value must be <= ${rule.max}` });
        }
      }

      // String rules
      if (typeof val === 'string') {
        if (val.length > (rule.maxLength || 2000)) {
          errors.push({ path, msg: `String length exceeds maximum (${rule.maxLength || 2000})` });
        }
        if (rule.pattern && !rule.pattern.test(val)) {
          errors.push({ path, msg: `String does not match required pattern` });
        }
      }

      // Array rules
      if (Array.isArray(val)) {
        if (val.length > (rule.maxItems || maxItems)) {
          errors.push({ path, msg: `Array length exceeds maximum (${rule.maxItems || maxItems})` });
        }
        if (rule.items) {
          const outArr = [];
          for (let i = 0; i < val.length; i++) {
            outArr.push(check(rule.items, val[i], `${path}[${i}]`, depth + 1));
          }
          return outArr;
        }
        return val;
      }

      // Object rules
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const outObj = Object.create(null);
        const keys = Object.keys(val);
        const expectedProps = rule.properties || {};

        for (const k of keys) {
          if (DANGEROUS_KEYS.has(k)) {
            errors.push({ path: `${path}.${k}`, msg: `Prohibited dangerous object key` });
            continue;
          }

          if (expectedProps[k]) {
            outObj[k] = check(expectedProps[k], val[k], path ? `${path}.${k}` : k, depth + 1);
          } else if (rule.additionalProperties) {
            outObj[k] = check(rule.additionalProperties, val[k], path ? `${path}.${k}` : k, depth + 1);
          } else {
            if (unknownPolicy === 'reject') {
              errors.push({ path: `${path}.${k}`, msg: `Unknown property '${k}' is not allowed` });
            } else if (unknownPolicy === 'keep') {
              outObj[k] = val[k];
            }
          }
        }

        // Check required fields in properties
        for (const [propName, propRule] of Object.entries(expectedProps)) {
          if (propRule.required && (val[propName] === undefined || val[propName] === null)) {
            errors.push({ path: path ? `${path}.${propName}` : propName, msg: `Field is required` });
          } else if (val[propName] === undefined && propRule.default !== undefined) {
            outObj[propName] = propRule.default;
          }
        }

        return outObj;
      }

      return val;
    }

    try {
      const sanitized = safeClone(data);
      const value = check(schema, sanitized, '', 0);
      return { ok: errors.length === 0, errors, value };
    } catch (err) {
      return { ok: false, errors: [{ path: '', msg: `Unexpected validation error: ${err.message}` }], value: data };
    }
  }

  function parseSafeYaml(raw, YAML) {
    if (!raw || typeof raw !== 'string') {
      return { ok: false, error: 'Empty or invalid YAML string' };
    }
    if (raw.length > 2 * 1024 * 1024) {
      return { ok: false, error: 'YAML size exceeds 2 MB limit' };
    }
    if (/!(?:[a-zA-Z0-9_-]+)/.test(raw)) {
      return { ok: false, error: 'Custom YAML tags are prohibited for security' };
    }
    try {
      const parsed = YAML.parse(raw, { merge: false, maxAliasCount: 50, schema: 'core' });
      if (!parsed || typeof parsed !== 'object') {
        return { ok: false, error: 'Parsed YAML root must be an object' };
      }
      return { ok: true, data: safeClone(parsed) };
    } catch (err) {
      return { ok: false, error: `YAML parse error: ${err.message}` };
    }
  }

  // Predefined Normative Schemas
  const ItemSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', required: true, pattern: /^[a-z0-9_-]{3,64}$/i },
      kind: { type: 'string', required: true, enum: ['island', 'service', 'widget', 'text', 'divider', 'image', 'spacer'] },
      type: { type: 'string' },
      title: { type: 'string', maxLength: 300 },
      subtitle: { type: 'string', maxLength: 500 },
      props: { type: 'object' },
      bind: { type: 'object' },
      probe: { type: 'object' },
      acl: {
        type: 'object',
        properties: { visibility: { type: 'string', enum: ['public', 'user', 'admin'], default: 'public' } }
      },
      rev: { type: 'integer', min: 1, default: 1 }
    }
  };

  const ConfigV2Schema = {
    type: 'object',
    properties: {
      version: { type: 'integer', required: true, enum: [2] },
      settings: {
        type: 'object',
        properties: {
          title: { type: 'string', default: 'DimDash', maxLength: 100 },
          locale: { type: 'string', enum: ['fa', 'en'], default: 'fa' },
          calendar: { type: 'string', enum: ['persian', 'gregorian', 'both'], default: 'both' },
          quality: { type: 'string', enum: ['auto', 'high', 'medium', 'low'], default: 'auto' },
          theme: { type: 'object' },
          search: { type: 'object' },
          displays: { type: 'array' }
        }
      },
      servers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', required: true },
            name: { type: 'string' },
            type: { type: 'string', enum: ['local', 'agent_push', 'http_pull'], default: 'local' },
            color: { type: 'string' },
            url: { type: 'string' },
            interval: { type: 'number' }
          }
        }
      },
      items: { type: 'array', items: ItemSchema }
    }
  };

  const LayoutV2Schema = {
    type: 'object',
    properties: {
      version: { type: 'integer', required: true, enum: [2] },
      rev: { type: 'integer', required: true, min: 1 },
      profiles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', required: true },
            match: { type: 'object' },
            mode: { type: 'string', enum: ['flow', 'fit'], default: 'fit' },
            design: { type: 'array' },
            ui: { type: 'string' }
          }
        }
      },
      placement: {
        type: 'object',
        additionalProperties: { type: 'object' }
      }
    }
  };

  const SecretsV2Schema = {
    type: 'object',
    properties: {
      version: { type: 'integer', required: true, enum: [2] },
      admin_pin: { type: 'object' },
      user_pin: { type: 'object' },
      server_tokens: { type: 'object' },
      session_secret: { type: 'string' }
    }
  };

  const PatchOpSchema = {
    type: 'object',
    properties: {
      op: { type: 'string', required: true, enum: ['set', 'merge', 'add', 'remove', 'move', 'test'] },
      path: { type: 'string', required: true, pattern: /^\/[a-zA-Z0-9_\-\.\/]+$/ },
      value: {},
      to: { type: 'integer' }
    }
  };

  const PatchRequestSchema = {
    type: 'object',
    properties: {
      base: { type: 'integer', required: true, min: 0 },
      client: { type: 'string', required: true, maxLength: 64 },
      seq: { type: 'integer' },
      ops: { type: 'array', required: true, items: PatchOpSchema, maxItems: 200 }
    }
  };

  return {
    validate,
    parseSafeYaml,
    safeClone,
    ConfigV2Schema,
    LayoutV2Schema,
    SecretsV2Schema,
    PatchOpSchema,
    PatchRequestSchema,
    ItemSchema
  };
});
