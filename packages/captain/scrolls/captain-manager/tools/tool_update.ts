import { defineTool } from '../../../src/captain-tool';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export default defineTool({
  description: 'Update an existing custom tool (overwrites code)',
  parameters: {
    target: { type: 'string', required: true, description: 'Target workflow/category' },
    name: { type: 'string', required: true, description: 'Tool name' },
    description: { type: 'string', required: true, description: 'Tool description' },
    parameters: { type: 'object', required: true, description: 'JSON schema for parameters' },
    code: { type: 'string', required: true, description: 'Function body code' }
  },
  execute: async ({ target, name, description, parameters, code }) => {
    const projectRoot = process.cwd();
    const baseDir = join(projectRoot, '.opencode/scrolls');
    const toolFile = join(baseDir, target, 'tools', `${name}.ts`);
    
    if (!existsSync(toolFile)) {
      return { error: `Tool "${name}" does not exist in "${target}". Use create_tool instead.` };
    }
    
    const paramsJson = JSON.stringify(parameters, null, 2).replace(/\n/g, '\n');
    
    const fileContent = `
/**
 * ${description}
 */
export const description = ${JSON.stringify(description)};

export const parameters = ${paramsJson};

export default async function execute(args) {
  const { ${Object.keys(parameters).join(', ')} } = args;
  
${code}
};
`.trim();

    try {
      writeFileSync(toolFile, fileContent, 'utf-8');
      return { success: true, action: 'updated', path: toolFile };
    } catch (err) {
      return { error: `Failed to update tool: ${err}` };
    }
  }
});
