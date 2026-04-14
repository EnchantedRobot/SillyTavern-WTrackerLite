export function schemaToExample(schema: any): string {
  return JSON.stringify(generateExample(schema), null, 2);
}

function generateExample(schema: any): any {
  if (schema.example) {
    return schema.example;
  }

  switch (schema.type) {
    case 'object':
      const obj: { [key: string]: any } = {};
      if (schema.properties) {
        for (const key in schema.properties) {
          obj[key] = generateExample(schema.properties[key]);
        }
      }
      return obj;
    case 'array':
      if (schema.items) {
        return [generateExample(schema.items)];
      }
      return [];
    case 'string':
      return schema.description || 'string';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    default:
      return null;
  }
}
