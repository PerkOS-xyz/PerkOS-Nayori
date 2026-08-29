import { generateFiles } from 'fumadocs-openapi';
import { createOpenAPI } from 'fumadocs-openapi/server';

const input = createOpenAPI({
  input: ['./openapi/nayori-api.json'],
});

await generateFiles({
  input,
  output: './content/docs/reference/api/operations',
  per: 'operation',
  groupBy: 'none',
  name(output) {
    const operation = this.document.paths?.[output.item.path]?.[output.item.method];
    const name = operation?.operationId ?? `${output.item.method}-${output.item.path}`;
    return name
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  },
  includeDescription: true,
  addGeneratedComment: 'This file is generated from openapi/nayori-api.json. Do not edit manually.',
  meta: true,
  frontmatter(title, description) {
    return {
      title,
      description: description ?? 'Nayori API operation generated from the versioned OpenAPI schema.',
      full: true,
    };
  },
});
