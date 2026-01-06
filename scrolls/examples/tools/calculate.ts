export const description = 'Perform basic arithmetic calculations';

export const parameters = {
  a: { type: 'number' as const, required: true, description: 'First number' },
  b: { type: 'number' as const, required: true, description: 'Second number' },
  op: { type: 'string' as const, required: true, enum: ['add', 'sub', 'mul', 'div'], description: 'Operation' },
};

export default async ({ a, b, op }: { a: number; b: number; op: string }) => {
  let result: number;
  switch (op) {
    case 'add':
      result = a + b;
      break;
    case 'sub':
      result = a - b;
      break;
    case 'mul':
      result = a * b;
      break;
    case 'div':
      if (b === 0) return { error: 'Division by zero' };
      result = a / b;
      break;
    default:
      return { error: `Unknown operation: ${op}` };
  }
  return { a, b, op, result };
};
