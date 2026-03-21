"use client";

import { PageProvider } from "./page-provider";
import SchoolMappingListClient from "./page.client";

export default function ClientPage() {
  return (
    <PageProvider>
      <SchoolMappingListClient />
    </PageProvider>
  );
}
