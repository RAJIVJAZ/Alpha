import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { InboxQueryDto } from './notification.dto';

// same options as the services' global pipe
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const parse = (query: Partial<Record<string, string>>) =>
  pipe.transform(query, { type: 'query', metatype: InboxQueryDto }) as Promise<InboxQueryDto>;

describe('InboxQueryDto', () => {
  it('defaults to the first page of 30', async () => {
    expect(await parse({})).toMatchObject({ page: 1, pageSize: 30 });
  });

  it('honours page and pageSize from the query string', async () => {
    expect(await parse({ page: '3', pageSize: '5' })).toMatchObject({ page: 3, pageSize: 5 });
  });

  it.each([{ pageSize: '101' }, { pageSize: '0' }, { page: '0' }, { pageSize: 'x' }])(
    'rejects %j',
    async (query) => {
      await expect(parse(query)).rejects.toThrow();
    },
  );
});
