import { check, numeric, pgTable, serial, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const categoriesTable = pgTable(
  "expense_categories",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    budgetLimit: numeric("budget_limit", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    color: varchar("color", { length: 10 }).notNull().default("#10b981"),
  },
  (table) => [check("expense_categories_budget_nonnegative", sql`${table.budgetLimit} >= 0`)],
);
