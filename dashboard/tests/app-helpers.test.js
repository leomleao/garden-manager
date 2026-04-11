// dashboard/tests/app-helpers.test.js
const { extractEmoji } = require('../public/app/app.js');

describe('extractEmoji', () => {
  test('extracts emoji at start of string', () => {
    expect(extractEmoji('🍅 Tomato')).toEqual({ emoji: '🍅', name: 'Tomato' });
  });

  test('extracts emoji at end of string', () => {
    expect(extractEmoji('Tomato 🍅')).toEqual({ emoji: '🍅', name: 'Tomato' });
  });

  test('extracts emoji embedded in middle of string', () => {
    expect(extractEmoji('Tom🌿ato')).toEqual({ emoji: '🌿', name: 'Tomato' });
  });

  test('uses first emoji when multiple are present', () => {
    expect(extractEmoji('🍅🌿 Tomato')).toEqual({ emoji: '🍅', name: 'Tomato' });
  });

  test('all emojis stripped from name when multiple present', () => {
    const result = extractEmoji('🍅🌿 Tomato');
    expect(result.name).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(result.name).toBe('Tomato');
  });

  test('returns null emoji when no emoji present', () => {
    expect(extractEmoji('Tomato')).toEqual({ emoji: null, name: 'Tomato' });
  });

  test('returns empty name when input is emoji only', () => {
    expect(extractEmoji('🍅')).toEqual({ emoji: '🍅', name: '' });
  });

  test('trims surrounding whitespace from name', () => {
    expect(extractEmoji('  Tomato  ')).toEqual({ emoji: null, name: 'Tomato' });
  });

  test('normalises multiple spaces after emoji strip', () => {
    expect(extractEmoji('🍅  Tomato  Basil')).toEqual({ emoji: '🍅', name: 'Tomato Basil' });
  });

  test('handles empty string', () => {
    expect(extractEmoji('')).toEqual({ emoji: null, name: '' });
  });
});
