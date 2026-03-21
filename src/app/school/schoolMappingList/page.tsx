"use client";

import dynamic from "next/dynamic";

const ClientPage = dynamic(() => import("./ClientPage"), {
  ssr: false,
});

export default function SchoolMappingList() {
  return <ClientPage />;
}
