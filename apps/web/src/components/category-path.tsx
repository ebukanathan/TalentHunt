import Link from "next/link";
import type { Contestant } from "@/lib/api/schemas";
import { categoryPath } from "@/lib/category-path";
export function CategoryPath({ category, subcategory }: Pick<Contestant, "category" | "subcategory">) {
  return <nav className="category-path" aria-label="Contestant category"><Link prefetch={false} href="/contestants">Contestants</Link><span aria-hidden="true">/</span><Link prefetch={false} href={categoryPath(category.id)}>{category.name}</Link><span aria-hidden="true">/</span><Link prefetch={false} href={categoryPath(category.id, subcategory.id)}>{subcategory.name}</Link></nav>;
}
