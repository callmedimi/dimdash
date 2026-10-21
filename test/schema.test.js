const { test, describe } = require('node:test');
const assert = require('node:assert');
const YAML = require('yaml');
const {
  validate,
  parseSafeYaml,
  safeClone,
  ConfigV2Schema,
  LayoutV2Schema,
  SecretsV2Schema,
  PatchOpSchema,
  PatchRequestSchema
} = require('../server/schema');

describe('Schema Validator & Safe YAML', () => {
  test('rejects YAML exceeding 2MB size limit', () => {
    const huge = 'a'.repeat(2 * 1024 * 1024 + 10);
    const res = parseSafeYaml(huge, YAML);
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /exceeds 2 MB/);
  });

  test('rejects custom YAML tags to prevent code execution', () => {
    const dangerous = 'foo: !js/function "function() {}"';
    const res = parseSafeYaml(dangerous, YAML);
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /Custom YAML tags/);
  });

  test('parses safe standard YAML cleanly', () => {
    const valid = 'version: 2\ntitle: "Test Dashboard"';
    const res = parseSafeYaml(valid, YAML);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.data.version, 2);
    assert.strictEqual(res.data.title, 'Test Dashboard');
  });

  test('prevents prototype pollution via __proto__ and constructor', () => {
    const polluted = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"hacked":true}},"safe":"yes"}');
    const cleaned = safeClone(polluted);
    assert.strictEqual(cleaned.polluted, undefined);
    assert.strictEqual(Object.prototype.polluted, undefined);
    assert.strictEqual(cleaned.safe, 'yes');
  });

  test('validates basic type checking', () => {
    const schema = { type: 'object', properties: { count: { type: 'integer' } } };
    const invalid = validate(schema, { count: '12' });
    assert.strictEqual(invalid.ok, false);

    const valid = validate(schema, { count: 12 });
    assert.strictEqual(valid.ok, true);
  });

  test('validates enum values correctly', () => {
    const schema = { type: 'object', properties: { mode: { enum: ['fit', 'flow'] } } };
    assert.strictEqual(validate(schema, { mode: 'invalid' }).ok, false);
    assert.strictEqual(validate(schema, { mode: 'fit' }).ok, true);
    assert.strictEqual(validate(schema, { mode: 'flow' }).ok, true);
  });

  test('validates number ranges', () => {
    const schema = { type: 'object', properties: { port: { type: 'number', min: 1, max: 65535 } } };
    assert.strictEqual(validate(schema, { port: 0 }).ok, false);
    assert.strictEqual(validate(schema, { port: 70000 }).ok, false);
    assert.strictEqual(validate(schema, { port: 8080 }).ok, true);
  });

  test('validates string maximum length', () => {
    const schema = { type: 'object', properties: { title: { type: 'string', maxLength: 10 } } };
    assert.strictEqual(validate(schema, { title: '12345678901' }).ok, false);
    assert.strictEqual(validate(schema, { title: '12345' }).ok, true);
  });

  test('validates unknown-key policy reject vs keep', () => {
    const schemaReject = { type: 'object', properties: { a: { type: 'string' } }, unknownPolicy: 'reject' };
    assert.strictEqual(validate(schemaReject, { a: 'ok', extra: 'bad' }).ok, false);

    const schemaKeep = { type: 'object', properties: { a: { type: 'string' } }, unknownPolicy: 'keep' };
    const resKeep = validate(schemaKeep, { a: 'ok', extra: 'allowed' });
    assert.strictEqual(resKeep.ok, true);
    assert.strictEqual(resKeep.value.extra, 'allowed');
  });

  test('validates ConfigV2Schema structure', () => {
    const validConfig = {
      version: 2,
      settings: { title: 'My Dash', locale: 'fa', calendar: 'both' },
      servers: [{ id: 'local', name: 'Master', type: 'local' }],
      items: [
        { id: 'it_isl1', kind: 'island', title: 'Network' },
        { id: 'it_srv1', kind: 'service', title: 'Router', props: { target_url: 'http://192.168.1.1' } }
      ]
    };
    const res = validate(ConfigV2Schema, validConfig);
    assert.strictEqual(res.ok, true);
  });

  test('validates LayoutV2Schema structure', () => {
    const validLayout = {
      version: 2,
      rev: 12,
      profiles: [{ id: 'lg', mode: 'fit' }],
      placement: {
        it_isl1: { lg: { x: 100, y: 100, w: 500, h: 300, parent: null } }
      }
    };
    const res = validate(LayoutV2Schema, validLayout);
    assert.strictEqual(res.ok, true);
  });

  test('validates SecretsV2Schema structure', () => {
    const validSecrets = {
      version: 2,
      admin_pin: { value: '1234', legacy: true },
      server_tokens: { srv_backup: 'token123' },
      session_secret: 'abc'
    };
    const res = validate(SecretsV2Schema, validSecrets);
    assert.strictEqual(res.ok, true);
  });

  test('validates PatchRequestSchema and PatchOpSchema', () => {
    const validPatch = {
      base: 10,
      client: 'c_test',
      ops: [
        { op: 'set', path: '/placement/it_1/lg', value: { x: 10, y: 20 } },
        { op: 'merge', path: '/items/it_1/props', value: { color: '#fff' } }
      ]
    };
    const res = validate(PatchRequestSchema, validPatch);
    assert.strictEqual(res.ok, true);

    const invalidOp = {
      base: 10,
      client: 'c_test',
      ops: [{ op: 'unknown_op', path: '/items' }]
    };
    assert.strictEqual(validate(PatchRequestSchema, invalidOp).ok, false);
  });

  test('validates required fields failure on missing key', () => {
    const schema = { type: 'object', properties: { name: { type: 'string', required: true } } };
    const res = validate(schema, {});
    assert.strictEqual(res.ok, false);
    assert.match(res.errors[0].msg, /required/);
  });

  test('validates regex pattern matching on string values', () => {
    const schema = { type: 'object', properties: { code: { type: 'string', pattern: /^[A-Z]{3}$/ } } };
    assert.strictEqual(validate(schema, { code: 'ABC' }).ok, true);
    assert.strictEqual(validate(schema, { code: 'abcd' }).ok, false);
  });

  test('validates nesting depth constraint (max 6 levels)', () => {
    let deep = { val: 1 };
    for (let i = 0; i < 8; i++) deep = { child: deep };
    const schema = { type: 'object', additionalProperties: { type: 'object' } };
    const res = validate(schema, deep);
    assert.strictEqual(res.ok, false);
    assert.match(res.errors[0].msg, /depth exceeds/);
  });

  test('validates integer type rejects floating point numbers', () => {
    const schema = { type: 'object', properties: { count: { type: 'integer' } } };
    assert.strictEqual(validate(schema, { count: 3.14159 }).ok, false);
    assert.strictEqual(validate(schema, { count: 42 }).ok, true);
  });

  test('validates ItemSchema kind allows all 7 normative kinds', () => {
    const kinds = ['island', 'service', 'widget', 'text', 'divider', 'image', 'spacer'];
    for (const kind of kinds) {
      const item = { id: `it_${kind}`, kind, title: 'Item' };
      const res = validate(ConfigV2Schema, { version: 2, items: [item] });
      assert.strictEqual(res.ok, true, `Failed on kind: ${kind}`);
    }
  });

  test('validates ItemSchema rejects unlisted kinds', () => {
    const item = { id: 'it_bad', kind: 'unsupported_kind', title: 'Bad' };
    const res = validate(ConfigV2Schema, { version: 2, items: [item] });
    assert.strictEqual(res.ok, false);
  });

  test('validates ItemSchema id pattern enforces 3-64 valid chars', () => {
    const tooShort = { id: 'a', kind: 'service' };
    const badChars = { id: 'bad ID with spaces!', kind: 'service' };
    const valid = { id: 'valid_id-123', kind: 'service' };

    assert.strictEqual(validate(ConfigV2Schema, { version: 2, items: [tooShort] }).ok, false);
    assert.strictEqual(validate(ConfigV2Schema, { version: 2, items: [badChars] }).ok, false);
    assert.strictEqual(validate(ConfigV2Schema, { version: 2, items: [valid] }).ok, true);
  });

  test('validates LayoutV2Schema requires rev to be an integer >= 1', () => {
    const noRev = { version: 2, profiles: [] };
    const zeroRev = { version: 2, rev: 0, profiles: [] };
    const validRev = { version: 2, rev: 1, profiles: [] };

    assert.strictEqual(validate(LayoutV2Schema, noRev).ok, false);
    assert.strictEqual(validate(LayoutV2Schema, zeroRev).ok, false);
    assert.strictEqual(validate(LayoutV2Schema, validRev).ok, true);
  });
});

