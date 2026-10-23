import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { categoriesTable } from "./categories";

export const expensesTable = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    date: date("expense_date", { mode: "string" }).notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categoriesTable.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 10, scale: 2, mode: "number" }).notNull(),
    description: varchar("description", { length: 255 }),
    paymentMethod: varchar("payment_method", { length: 50 })
      .notNull()
      .default("Credit Card"),
    recurring: boolean("is_recurring").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("expenses_expense_date_idx").on(table.date),
    index("expenses_category_id_idx").on(table.categoryId),
    check("expenses_amount_positive", sql`${table.amount} > 0`),
  ],
);
