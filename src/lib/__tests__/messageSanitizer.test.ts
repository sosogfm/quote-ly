import { sanitizeMessage, sanitizeMessages } from '../messageSanitizer';

describe('sanitizeMessage', () => {
  it('remove "reasoning_content" when present', () => {
    const input = {
      role: 'assistant',
      content: 'Resposta',
      reasoning_content: 'Detalhes internos',
    } as any;
    const output = sanitizeMessage(input);
    expect((output as any).reasoning_content).toBeUndefined();
    expect(output.content).toBe('Resposta');
  });

  it('keeps other properties unchanged', () => {
    const input = { role: 'user', content: 'Oi' } as any;
    const output = sanitizeMessage(input);
    expect(output).toEqual(input);
  });
});

describe('sanitizeMessages', () => {
  it('applies sanitização a todo o array', () => {
    const msgs = [
      { role: 'assistant', content: 'A', reasoning_content: 'X' } as any,
      { role: 'user', content: 'B' } as any,
    ];
    const result = sanitizeMessages(msgs);
    expect((result[0] as any).reasoning_content).toBeUndefined();
    expect(result[1]).toEqual(msgs[1]);
  });
});
