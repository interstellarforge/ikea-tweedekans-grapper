import { notFound } from "next/navigation";

import { ProductPage } from "@/features/product/components/ProductPage.tsx";

const ARTICLE_NUMBER = /^\d{8}$/;

export default async function Page({
  params,
}: {
  params: Promise<{ article: string }>;
}) {
  const { article } = await params;
  if (!ARTICLE_NUMBER.test(article)) notFound();
  return <ProductPage article={article} />;
}
