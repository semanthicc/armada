import { defineTool } from '../../../src/captain-tool';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export default defineTool({
  description: 'Create a new custom tool for a workflow',
  parameters: {
    target: { type: 'string', required: true, description: 'Target workflow (e.g., "marketing/research") or category ("marketing")' },
    name: { type: 'string', required: true, description: 'Tool name (e.g., "fetch-data")' },
    description: { type: 'string', required: true, description: 'Tool description' },
    parameters: { type: 'object', required: true, description: 'JSON schema for parameters (key: { type, required?, description? })' },
    code: { type: 'string', required: true, description: 'Function body code. Variable names must match keys in parameters.' },
    force: { type: 'boolean', default: false, description: 'Overwrite if exists' }
  },
  execute: async ({ target, name, description, parameters, code, force }) => {
    const projectRoot = process.cwd();
    const baseDir = join(projectRoot, '.opencode/scrolls');
    
    let toolsDir: string;
    toolsDir = join(baseDir, target, 'tools');
    
    if (!existsSync(toolsDir)) {
      mkdirSync(toolsDir, { recursive: true });
    }
    
    const filePath = join(toolsDir, `${name}.ts`);
    
    if (existsSync(filePath) && !force) {
      return { error: `Tool "${name}" already exists in "${target}". Use force=true to overwrite.` };
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

    writeFileSync(filePath, fileContent, 'utf-8');
    
    return { success: true, path: filePath, name };
  }
});
