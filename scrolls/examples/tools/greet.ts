import { defineTool } from '../../../src/captain-tool';

export default defineTool({
  description: 'Greet someone with a friendly message',
  parameters: {
    name: { type: 'string', required: true, description: 'Name to greet' },
    formal: { type: 'boolean', default: false, description: 'Use formal greeting' },
  },
  execute: async ({ name, formal }) => {
    const greeting = formal ? `Good day, ${name}. How may I assist you?` : `Hey ${name}! 👋`;
    return { greeting, formal: formal ?? false };
  },
});
