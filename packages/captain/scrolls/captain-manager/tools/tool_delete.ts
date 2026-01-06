import { defineTool } from '../../../src/captain-tool';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

export default defineTool({
  description: 'Delete a custom tool',
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
      unlinkSync(toolFile);
      return { success: true, action: 'deleted', path: toolFile };
    } catch (err) {
      return { error: `Failed to delete tool: ${err}` };
    }
  }
});
