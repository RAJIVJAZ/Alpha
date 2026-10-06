export interface PageQuery {
  page?: number;
  pageSize?: number;
}

export function normalizePage(q: PageQuery = {}, maxPageSize = 100) {
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const pageSize = Math.min(maxPageSize, Math.max(1, Math.floor(Number(q.pageSize) || 20)));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginate<T>(data: T[], total: number, page: number, pageSize: number) {
  return {
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}
