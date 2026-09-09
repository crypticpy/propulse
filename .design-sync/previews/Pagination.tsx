import { useState } from "react";
import { Pagination } from "propulse";

export function Default() {
  const [page, setPage] = useState(2);
  const [pageSize, setPageSize] = useState(24);
  return (
    <Pagination
      currentPage={page}
      totalPages={8}
      onPageChange={setPage}
      pageSize={pageSize}
      onPageSizeChange={setPageSize}
      totalCount={182}
      entityName="nets"
    />
  );
}

export function FirstPage() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(48);
  return (
    <Pagination
      currentPage={page}
      totalPages={12}
      onPageChange={setPage}
      pageSize={pageSize}
      onPageSizeChange={setPageSize}
      totalCount={560}
      entityName="QSOs"
    />
  );
}
