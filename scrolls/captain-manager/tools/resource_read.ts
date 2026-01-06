import { defineTool } from '../../../src/captain-tool';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PLUGIN_ROOT = join(process.cwd());
const SCROLL_FOLDERS = ['scrolls', 'orders', 'workflows', 'commands'];

export default defineTool({
  description: 'Read the content of a workflow, rule, or crew',
  parameters: {
    name: { type: 'string', required: true, description: 'Name of the item (e.g., "marketing/research")' },
    type: { type: 'string', enum: ['workflow', 'rule', 'crew'], description: 'Type hint' }
  },
  execute: async ({ name, type }) => {
    const dirs = [
      { path: join(process.cwd(), '.opencode'), source: 'project' },
      { path: join(homedir(), '.config', 'opencode'), source: 'global' },
      { path: PLUGIN_ROOT, source: 'bundled' }
    ];

    for (const { path: root } of dirs) {
      if (!existsSync(root)) continue;

      for (const folderName of SCROLL_FOLDERS) {
        const dirPath = join(root, folderName);
        if (!existsSync(dirPath)) continue;

        const exactPath = join(dirPath, `${name}.md`);
        if (existsSync(exactPath)) {
          return {
            name,
            path: exactPath,
            content: readFileSync(exactPath, 'utf-8')
          };
        }

        const nestedPath = join(dirPath, name, 'index.md');
        if (existsSync(nestedPath)) {
          return {
            name,
            path: nestedPath,
            content: readFileSync(nestedPath, 'utf-8')
          };
        }
      }
    }

    return { error: `Item "${name}" not found.` };
  }
});
