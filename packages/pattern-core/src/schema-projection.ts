import { z } from 'zod';

/** Export-only projection for the pinned Zod vocabulary below. Zod remains the
 * structural validator; cross-reference/coverage checks are semantic gates. */
export function projectJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodOptional) return projectJsonSchema(schema.unwrap());
  if (schema instanceof z.ZodNullable) return { anyOf: [projectJsonSchema(schema.unwrap()), { type: 'null' }] };
  if (schema instanceof z.ZodLiteral) return { const: schema.value };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema.options };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' };
    for (const check of schema._def.checks) {
      if (check.kind === 'min') result.minLength = check.value;
      else if (check.kind === 'max') result.maxLength = check.value;
      else if (check.kind === 'regex') result.pattern = check.regex.source;
      else throw new Error(`Unsupported string check: ${check.kind}`);
    }
    return result;
  }
  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: 'number' };
    for (const check of schema._def.checks) {
      if (check.kind === 'int') result.type = 'integer';
      else if (check.kind === 'min') result[check.inclusive ? 'minimum' : 'exclusiveMinimum'] = check.value;
      else if (check.kind === 'max') result[check.inclusive ? 'maximum' : 'exclusiveMaximum'] = check.value;
      else throw new Error(`Unsupported number check: ${check.kind}`);
    }
    return result;
  }
  if (schema instanceof z.ZodArray) {
    const result: Record<string, unknown> = { type: 'array', items: projectJsonSchema(schema.element) };
    if (schema._def.minLength) result.minItems = schema._def.minLength.value;
    if (schema._def.maxLength) result.maxItems = schema._def.maxLength.value;
    return result;
  }
  if (schema instanceof z.ZodRecord) return { type: 'object', additionalProperties: projectJsonSchema(schema.valueSchema) };
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, unknown> = {}, required: string[] = [];
    for (const [key, value] of Object.entries(schema.shape) as Array<[string, z.ZodTypeAny]>) {
      properties[key] = projectJsonSchema(value);
      if (!(value instanceof z.ZodOptional)) required.push(key);
    }
    if (schema._def.unknownKeys !== 'strict') throw new Error('Schema objects must be closed.');
    return { type: 'object', properties, required, additionalProperties: false };
  }
  if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
    return { anyOf: schema.options.map(projectJsonSchema) };
  }
  throw new Error(`Unsupported Zod projection: ${schema._def.typeName}`);
}
