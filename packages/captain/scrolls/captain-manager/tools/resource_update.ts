import { defineTool } from '../../../src/captain-tool';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PLUGIN_ROOT = join(process.cwd());
const SCROLL_FOLDERS = ['scrolls', 'orders', 'workflows', 'commands'];

export default defineTool({
  description: 'Update an existing workflow, rule, or crew',
  parameters: {
    name: { type: 'string', required: true, description: 'Name of the item to update' },
    content: { type: 'string', required: true, description: 'New full content' },
    type: { type: 'string', enum: ['workflow', 'rule', 'crew'], description: 'Type hint' }
  },
  execute: async ({ name, content, type }) => {
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
          writeFileSync(exactPath, content, 'utf-8');
          return { success: true, path: exactPath, name, action: 'updated' };
        }

        const nestedPath = join(dirPath, name, 'index.md');
        if (existsSync(nestedPath)) {
          writeFileSync(nestedPath, content, 'utf-8');
          return { success: true, path: nestedPath, name, action: 'updated' };
        }
      }
    }

    return { error: `Item "${name}" not found. Cannot update.` };
  }
});
