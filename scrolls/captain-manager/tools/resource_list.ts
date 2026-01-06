import { defineTool } from '../../../src/captain-tool';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PLUGIN_ROOT = join(process.cwd());
const SCROLL_FOLDERS = ['scrolls', 'orders', 'workflows', 'commands'];

export default defineTool({
  description: 'List available workflows, rules, and crews',
  parameters: {
    type: { type: 'string', enum: ['workflow', 'rule', 'crew'], description: 'Filter by type' },
    tag: { type: 'string', description: 'Filter by tag' },
    folder: { type: 'string', description: 'Filter by folder' }
  },
  execute: async ({ type, tag, folder }) => {
    const items: Array<{ name: string; source: string; tags: string[]; path: string }> = [];
    const dirs = [
      { path: join(process.cwd(), '.opencode'), source: 'project' },
      { path: join(homedir(), '.config', 'opencode'), source: 'global' },
      { path: PLUGIN_ROOT, source: 'bundled' }
    ];

    for (const { path: root, source } of dirs) {
      if (!existsSync(root)) continue;

      for (const folderName of SCROLL_FOLDERS) {
        const dirPath = join(root, folderName);
        if (!existsSync(dirPath)) continue;

        const entries = readdirSync(dirPath, { recursive: true });
        for (const entry of entries) {
          if (typeof entry !== 'string' || !entry.endsWith('.md')) continue;
          
          const name = entry.replace(/\\/g, '/').replace(/\.md$/, '');
          const fullPath = join(dirPath, entry);
          const content = readFileSync(fullPath, 'utf-8');
          
          const match = content.match(/^---\n([\s\S]*?)\n---/);
          let tags: string[] = [];
          if (match) {
            const tagMatch = match[1].match(/tags:\s*\[(.*?)\]/);
            if (tagMatch) {
              tags = tagMatch[1].split(',').map(t => t.trim());
            }
          }

          let itemType = 'workflow';
          if (folderName === 'rules') itemType = 'rule';
          if (folderName === 'crews') itemType = 'crew';
          
          if (match) {
            const typeMatch = match[1].match(/type:\s*(\w+)/);
            if (typeMatch) itemType = typeMatch[1];
          }

          if (type && itemType !== type) continue;
          if (tag && !tags.includes(tag)) continue;
          if (folder && !name.startsWith(folder)) continue;

          items.push({ name, source, tags, path: fullPath });
        }
      }
    }

    return items;
  }
});
