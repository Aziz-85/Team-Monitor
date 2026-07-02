import { appendBoutiqueContextToApiPath } from '@/lib/scope/clientApiUrl';

describe('appendBoutiqueContextToApiPath', () => {
  it('returns path unchanged when no boutique context', () => {
    expect(appendBoutiqueContextToApiPath('/api/foo', null)).toBe('/api/foo');
  });

  it('appends ?b= from search params', () => {
    const params = { get: (k: string) => (k === 'b' ? 'S02' : null) };
    expect(appendBoutiqueContextToApiPath('/api/foo', params)).toBe('/api/foo?b=S02');
  });

  it('preserves existing query and adds b', () => {
    const params = { get: (k: string) => (k === 'b' ? 'S02' : null) };
    expect(
      appendBoutiqueContextToApiPath('/api/foo?sourceBoutiqueId=x', params)
    ).toBe('/api/foo?sourceBoutiqueId=x&b=S02');
  });
});
