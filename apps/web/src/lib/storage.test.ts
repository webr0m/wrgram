import { describe, expect, it } from 'vitest';
import { parseNotes } from './storage';

describe('validación de notas locales', () => {
  it('tolera datos corruptos', () => {
    expect(parseNotes(null)).toEqual({});
    expect(parseNotes(['nota'])).toEqual({});
  });
  it('solo admite notas de texto dentro del límite', () => {
    expect(parseNotes({ a: 'Una idea', b: 12, c: 'x'.repeat(5001) })).toEqual({ a: 'Una idea' });
  });
});
