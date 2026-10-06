import type { InternalHttpService } from '@foodgrid/utils/server';
import { DirectoryService } from './directory.service';

const fakeHttp = (impl: (service: string, path: string, body: { ids: string[] }) => Promise<unknown>) => {
  const calls: { service: string; path: string; ids: string[] }[] = [];
  const http = {
    post: async (service: string, path: string, body: { ids: string[] }) => {
      calls.push({ service, path, ids: body.ids });
      return impl(service, path, body);
    },
  } as unknown as InternalHttpService;
  return { http, calls };
};

describe('DirectoryService', () => {
  it('batches unknown ids per owner and serves repeats from cache', async () => {
    const { http, calls } = fakeHttp(async (_s, _p, body) => body.ids.filter((id) => id !== 'gone').map((id) => ({ id, name: `Outlet ${id}` })));
    const dir = new DirectoryService(http);
    const first = await dir.lookup('outlets', ['a', 'b', 'a', 'gone']);
    expect(first.get('a')?.name).toBe('Outlet a');
    expect(first.has('gone')).toBe(false);
    expect(calls).toEqual([{ service: 'order', path: 'internal/outlets/batch', ids: ['a', 'b', 'gone'] }]);

    await dir.lookup('outlets', ['b', 'gone']);
    expect(calls).toHaveLength(1); // misses are cached too
    await dir.lookup('outlets', ['c']);
    expect(calls[1]).toEqual({ service: 'order', path: 'internal/outlets/batch', ids: ['c'] });
  });

  it('returns what it has when the owner is down', async () => {
    const { http } = fakeHttp(async () => {
      throw new Error('UPSTREAM_UNAVAILABLE');
    });
    const names = await new DirectoryService(http).lookup('riders', ['r1']);
    expect(names.size).toBe(0);
  });
});
