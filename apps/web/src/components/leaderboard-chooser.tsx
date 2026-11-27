import Link from "next/link";
type Item = { id: string; name: string; isActive?: boolean };
type Page = { page: number; pages: number };
export function LeaderboardChooser({ competitionName, categories, subcategories, categoryId, categoryName, categoryPage, subcategoryPage, admin = false }: {
  competitionName: string; categories: Item[]; subcategories?: Item[]; categoryId?: string; categoryName?: string; categoryPage: Page; subcategoryPage?: Page; admin?: boolean;
}) {
  const base = `${admin ? "/admin" : ""}/leaderboard`;
  const path = (values: Record<string, string>) => `${base}?${new URLSearchParams(values)}`;
  const paging = (kind: "categoryPage" | "subcategoryPage", page: number) => path({ ...(categoryId ? { categoryId } : {}), [kind]: String(page) });
  const group = admin ? "subcategory" : "talent", groups = admin ? "subcategories" : "talents";
  return <section className={admin ? "admin-panel leaderboard" : "container contestants-page leaderboard"}><p className="eyebrow">{competitionName}</p><h1>Choose a leaderboard</h1><p>Each {group} has independent standings. Choose its category and {group} below.</p>
    <nav className="category-navigation" aria-label="Leaderboard category"><h2>Category</h2><ul className="scope-links">{categories.map(item => <li key={item.id}><Link prefetch={false} aria-current={categoryId === item.id ? "page" : undefined} href={path({ categoryId: item.id })}>{item.name}{item.isActive === false ? " (inactive)" : ""}</Link></li>)}</ul>{!categories.length && <p>No categories on this page.</p>}
      <div className="pagination">{categoryPage.page > 1 && <Link prefetch={false} href={paging("categoryPage", categoryPage.page - 1)}>Previous categories</Link>}{categoryPage.page < categoryPage.pages && <Link prefetch={false} href={paging("categoryPage", categoryPage.page + 1)}>More categories</Link>}</div></nav>
    {categoryId && <nav className="category-navigation" aria-label={admin ? "Leaderboard subcategory" : "Leaderboard talent"}><h2>{categoryName} {groups}</h2><ul className="scope-links">{subcategories?.map(item => <li key={item.id}><Link prefetch={false} href={path({ categoryId, subcategoryId: item.id })}>{item.name}{item.isActive === false ? " (inactive)" : ""}</Link></li>)}</ul>{!subcategories?.length && <p>No {groups} on this page. Choose another category.</p>}
      <div className="pagination">{subcategoryPage && subcategoryPage.page > 1 && <Link prefetch={false} href={paging("subcategoryPage", subcategoryPage.page - 1)}>Previous {groups}</Link>}{subcategoryPage && subcategoryPage.page < subcategoryPage.pages && <Link prefetch={false} href={paging("subcategoryPage", subcategoryPage.page + 1)}>More {groups}</Link>}</div></nav>}
  </section>;
}
