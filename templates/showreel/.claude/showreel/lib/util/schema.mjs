// Dependency-free JSON-Schema subset validator (C2).
// Supported: type, enum, const, required, properties, additionalProperties (false | schema),
// propertyNames, items, minItems, maxItems, minimum, maximum, pattern, oneOf, $ref (#/$defs/<name>).
// Any other keyword makes validate() THROW — a schema silently ignoring a rule is worse
// than no schema (Rule 12).

const ANNOTATIONS = new Set(['$schema', '$id', '$comment', '$defs', 'title', 'description', 'default', 'examples']);
const KEYWORDS = new Set([
  'type', 'enum', 'const', 'required', 'properties', 'additionalProperties', 'propertyNames',
  'items', 'minItems', 'maxItems', 'minimum', 'maximum', 'pattern', 'oneOf', '$ref',
]);

const checked = new WeakSet();

function assertSupported(schema, at) {
  if (typeof schema === 'boolean') return;
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error(`schema.mjs: schema at ${at || '/'} must be an object or boolean`);
  }
  for (const k of Object.keys(schema)) {
    if (!KEYWORDS.has(k) && !ANNOTATIONS.has(k)) {
      throw new Error(`schema.mjs: unsupported keyword "${k}" at ${at || '/'}`);
    }
  }
  if (schema.$ref !== undefined && !/^#\/\$defs\/[^/]+$/.test(schema.$ref)) {
    throw new Error(`schema.mjs: only "#/$defs/<name>" refs are supported (got "${schema.$ref}" at ${at || '/'})`);
  }
  for (const key of ['properties', '$defs']) {
    if (schema[key]) for (const [k, s] of Object.entries(schema[key])) assertSupported(s, `${at}/${key}/${k}`);
  }
  for (const key of ['additionalProperties', 'propertyNames', 'items']) {
    if (schema[key] !== undefined) assertSupported(schema[key], `${at}/${key}`);
  }
  if (schema.oneOf) schema.oneOf.forEach((s, i) => assertSupported(s, `${at}/oneOf/${i}`));
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function hasType(v, t) {
  switch (t) {
    case 'integer': return Number.isInteger(v);
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'object': return typeOf(v) === 'object';
    default: return typeOf(v) === t;
  }
}

const esc = (k) => String(k).replace(/~/g, '~0').replace(/\//g, '~1');

function check(schema, value, path, root, errors) {
  if (schema === true) return;
  if (schema === false) { errors.push({ path, message: 'is not allowed' }); return; }

  if (schema.$ref !== undefined) {
    const name = schema.$ref.slice('#/$defs/'.length);
    const target = root.$defs && root.$defs[name];
    if (!target) throw new Error(`schema.mjs: unresolved $ref "${schema.$ref}"`);
    check(target, value, path, root, errors);
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => hasType(value, t))) {
      errors.push({ path, message: `must be ${types.join(' or ')} (got ${typeOf(value)})` });
      return; // further keywords would only add noise
    }
  }
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    errors.push({ path, message: `must be ${JSON.stringify(schema.const)}` });
  }
  if (schema.enum !== undefined && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    errors.push({ path, message: `must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}` });
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path, message: `must be >= ${schema.minimum}` });
    if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path, message: `must be <= ${schema.maximum}` });
  }
  if (typeof value === 'string' && schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) {
    errors.push({ path, message: `must match pattern ${schema.pattern}` });
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push({ path, message: `must have >= ${schema.minItems} items` });
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push({ path, message: `must have <= ${schema.maxItems} items` });
    if (schema.items !== undefined) value.forEach((v, i) => check(schema.items, v, `${path}/${i}`, root, errors));
  }
  if (typeOf(value) === 'object') {
    for (const k of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, k)) errors.push({ path: `${path}/${esc(k)}`, message: 'is required' });
    }
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      const p = `${path}/${esc(k)}`;
      if (schema.propertyNames !== undefined) {
        const nameErrors = [];
        check(schema.propertyNames, k, p, root, nameErrors);
        for (const e of nameErrors) errors.push({ path: p, message: `property name ${e.message}` });
      }
      if (Object.prototype.hasOwnProperty.call(props, k)) check(props[k], v, p, root, errors);
      else if (schema.additionalProperties === false) errors.push({ path: p, message: 'is not an allowed property' });
      else if (schema.additionalProperties !== undefined) check(schema.additionalProperties, v, p, root, errors);
    }
  }
  if (schema.oneOf !== undefined) {
    const branchErrors = schema.oneOf.map((s) => {
      const e = [];
      check(s, value, path, root, e);
      return e;
    });
    const matched = branchErrors.filter((e) => e.length === 0).length;
    if (matched !== 1) {
      // If exactly one branch accepts the value's type, that branch was the intent:
      // report its precise errors. Otherwise report a summary.
      const typed = branchErrors.filter((e) => !(e.length === 1 && e[0].path === path && /^must be .* \(got /.test(e[0].message)));
      if (matched === 0 && typed.length === 1) errors.push(...typed[0]);
      else errors.push({ path, message: `must match exactly one oneOf branch (matched ${matched})` });
    }
  }
}

/** Returns [] when valid, else [{path, message}] with JSON-pointer paths ('' = root). */
export function validate(schema, value) {
  if (typeof schema === 'object' && schema !== null && !checked.has(schema)) {
    assertSupported(schema, '');
    checked.add(schema);
  }
  const errors = [];
  check(schema, value, '', schema, errors);
  return errors;
}
