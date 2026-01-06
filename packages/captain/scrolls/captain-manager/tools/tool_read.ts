import { defineTool } from '../../../src/captain-tool';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export default defineTool({
  description: 'Read the source code of a custom tool',
  parameters: {
    target: { type: 'string', required: true, description: 'Target workflow (e.g., "marketing/research") or category ("marketing")' },
    name: { type: 'string', required: true, description: 'Tool name' }
  },
  execute: async ({ target, name }) => {
    const projectRoot = process.cwd();
    const baseDir = join(projectRoot, '.opencode/scrolls');
    const toolFile = join(baseDir, target, 'tools', `${name}.ts`);
    
    if (!existsSync(toolFile)) {
      return { error: `Tool "${name}" not found in "${target}"` };
    }
    
    try {
      const content = readFileSync(toolFile, 'utf-8');
      return { 
        name,
        target,
        path: toolFile,
        content 
      };
    } catch (err) {
      return { error: `Failed to read tool: ${err}` };
    }
  }
});
