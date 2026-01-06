import { defineTool } from '../../../src/captain-tool';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

export default defineTool({
  description: 'Create a new workflow, rule, or crew',
  parameters: {
    type: { type: 'string', enum: ['workflow', 'rule', 'crew'], required: true },
    name: { type: 'string', required: true, description: 'Name (can be path like "marketing/research")' },
    content: { type: 'string', required: true, description: 'Full markdown content including frontmatter' },
    force: { type: 'boolean', default: false, description: 'Overwrite if exists' }
  },
  execute: async ({ type, name, content, force }) => {
    const targetFolder = '.opencode/scrolls';
    const projectRoot = process.cwd();
    const fullTargetDir = join(projectRoot, targetFolder);
    
    if (!existsSync(fullTargetDir)) {
      mkdirSync(fullTargetDir, { recursive: true });
    }

    let filePath: string;
    if (name.includes('/')) {
        filePath = join(fullTargetDir, `${name}.md`);
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
    } else {
        filePath = join(fullTargetDir, `${name}.md`);
    }

    if (existsSync(filePath) && !force) {
      return { error: `Item "${name}" already exists. Use force=true to overwrite.` };
    }

    writeFileSync(filePath, content, 'utf-8');
    return { success: true, path: filePath, name };
  }
});
