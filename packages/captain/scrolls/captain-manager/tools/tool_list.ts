import { defineTool } from '../../../src/captain-tool';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

export default defineTool({
  description: 'List custom tools in a workflow or category',
  parameters: {
    target: { type: 'string', required: true, description: 'Target workflow (e.g., "marketing/research") or category ("marketing")' }
  },
  execute: async ({ target }) => {
    const projectRoot = process.cwd();
    const baseDir = join(projectRoot, '.opencode/scrolls');
    const toolsDir = join(baseDir, target, 'tools');
    
    if (!existsSync(toolsDir)) {
      return { tools: [], message: `No tools directory found at ${target}` };
    }
    
    try {
      const files = readdirSync(toolsDir)
        .filter(f => f.endsWith('.ts') && !f.startsWith('_'));
      
      return { 
        target,
        tools: files.map(f => f.replace('.ts', '')),
        path: toolsDir
      };
    } catch (err) {
      return { error: `Failed to list tools: ${err}` };
    }
  }
});
