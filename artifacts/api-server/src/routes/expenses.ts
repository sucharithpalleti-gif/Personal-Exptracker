import { and, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateCategoryBody,
  CreateCategoryResponse,
  CreateExpenseBody,
  CreateExpenseResponse,
  DeleteExpenseParams,
  GetAnalyticsQueryParams,
  GetAnalyticsResponse,
  GetCategoriesResponse,
  GetExpensesQueryParams,
  GetExpensesResponse,
  UpdateCategoryBody,
  UpdateCategoryParams,
  UpdateCategoryResponse,
  UpdateExpenseBody,
  UpdateExpenseParams,
  UpdateExpenseResponse,
} from "@workspace/api-zod";
import { categoriesTable, db, expensesTable } from "@workspace/db";

const router: IRouter = Router();

type ExpenseFilters = {
  startDate?: string;
  endDate?: string;
  categoryId?: number;
  paymentMethod?: string;
  search?: string;
};

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validDateRange(filters: ExpenseFilters): boolean {
  if (filters.startDate && !isDateOnly(filters.startDate)) return false;
  if (filters.endDate && !isDateOnly(filters.endDate)) return false;
  return !filters.startDate || !filters.endDate || filters.startDate <= filters.endDate;
}

function filterConditions(filters: ExpenseFilters, includeSearch = false): SQL[] {
  const conditions: SQL[] = [];
  if (filters.startDate) conditions.push(gte(expensesTable.date, filters.startDate));
  if (filters.endDate) conditions.push(lte(expensesTable.date, filters.endDate));
  if (filters.categoryId) conditions.push(eq(expensesTable.categoryId, filters.categoryId));
  if (filters.paymentMethod && filters.paymentMethod !== "All") {
    conditions.push(eq(expensesTable.paymentMethod, filters.paymentMethod));
  }
  if (includeSearch && filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(expensesTable.description, term), ilike(categoriesTable.name, term))!);
  }
  return conditions;
}

async function selectExpenses(filters: ExpenseFilters) {
  return db
    .select({
      id: expensesTable.id,
      date: expensesTable.date,
      categoryId: expensesTable.categoryId,
      categoryName: categoriesTable.name,
      categoryColor: categoriesTable.color,
      categoryBudget: categoriesTable.budgetLimit,
      amount: expensesTable.amount,
      description: expensesTable.description,
      paymentMethod: expensesTable.paymentMethod,
      recurring: expensesTable.recurring,
      createdAt: expensesTable.createdAt,
    })
    .from(expensesTable)
    .innerJoin(categoriesTable, eq(expensesTable.categoryId, categoriesTable.id))
    .where(and(...filterConditions(filters, true)))
    .orderBy(desc(expensesTable.date), desc(expensesTable.createdAt));
}

async function selectExpenseById(id: number) {
  const [expense] = await db
    .select({
      id: expensesTable.id,
      date: expensesTable.date,
      categoryId: expensesTable.categoryId,
      categoryName: categoriesTable.name,
      categoryColor: categoriesTable.color,
      categoryBudget: categoriesTable.budgetLimit,
      amount: expensesTable.amount,
      description: expensesTable.description,
      paymentMethod: expensesTable.paymentMethod,
      recurring: expensesTable.recurring,
      createdAt: expensesTable.createdAt,
    })
    .from(expensesTable)
    .innerJoin(categoriesTable, eq(expensesTable.categoryId, categoriesTable.id))
    .where(eq(expensesTable.id, id))
    .limit(1);
  return expense;
}

function parseId(raw: string | string[] | undefined): unknown {
  return { id: Array.isArray(raw) ? raw[0] : raw };
}

router.get("/expenses", async (req, res): Promise<void> => {
  const parsed = GetExpensesQueryParams.safeParse(req.query);
  if (!parsed.success || !validDateRange(parsed.data)) {
    res.status(400).json({ error: parsed.success ? "Invalid date range" : parsed.error.message });
    return;
  }
  const expenses = await selectExpenses(parsed.data);
  res.json(GetExpensesResponse.parse(expenses));
});

router.post("/expenses", async (req, res): Promise<void> => {
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [category] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(eq(categoriesTable.id, parsed.data.categoryId))
    .limit(1);
  if (!category) {
    res.status(400).json({ error: "Choose an existing category" });
    return;
  }

  const [created] = await db
    .insert(expensesTable)
    .values({
      date: parsed.data.date.toISOString().slice(0, 10),
      categoryId: parsed.data.categoryId,
      amount: parsed.data.amount,
      description: parsed.data.description ?? null,
      paymentMethod: parsed.data.paymentMethod,
      recurring: parsed.data.recurring,
    })
    .returning({ id: expensesTable.id });
  const expense = await selectExpenseById(created.id);
  res.status(201).json(CreateExpenseResponse.parse(expense));
});

router.put("/expenses/:id", async (req, res): Promise<void> => {
  const params = UpdateExpenseParams.safeParse(parseId(req.params.id));
  const body = UpdateExpenseBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [category] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(eq(categoriesTable.id, body.data.categoryId))
    .limit(1);
  if (!category) {
    res.status(400).json({ error: "Choose an existing category" });
    return;
  }
  const [updated] = await db
    .update(expensesTable)
    .set({
      date: body.data.date.toISOString().slice(0, 10),
      categoryId: body.data.categoryId,
      amount: body.data.amount,
      description: body.data.description ?? null,
      paymentMethod: body.data.paymentMethod,
      recurring: body.data.recurring,
    })
    .where(eq(expensesTable.id, params.data.id))
    .returning({ id: expensesTable.id });
  if (!updated) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  const expense = await selectExpenseById(updated.id);
  res.json(UpdateExpenseResponse.parse(expense));
});

router.delete("/expenses/:id", async (req, res): Promise<void> => {
  const params = DeleteExpenseParams.safeParse(parseId(req.params.id));
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(expensesTable)
    .where(eq(expensesTable.id, params.data.id))
    .returning({ id: expensesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/categories", async (_req, res): Promise<void> => {
  const categories = await db.select().from(categoriesTable).orderBy(categoriesTable.name);
  res.json(GetCategoriesResponse.parse(categories));
});

router.post("/categories", async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [category] = await db.insert(categoriesTable).values(parsed.data).returning();
    res.status(201).json(CreateCategoryResponse.parse(category));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "A category with that name already exists" });
      return;
    }
    throw error;
  }
});

router.put("/categories/:id", async (req, res): Promise<void> => {
  const params = UpdateCategoryParams.safeParse(parseId(req.params.id));
  const body = UpdateCategoryBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const [category] = await db
      .update(categoriesTable)
      .set(body.data)
      .where(eq(categoriesTable.id, params.data.id))
      .returning();
    if (!category) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    res.json(UpdateCategoryResponse.parse(category));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "A category with that name already exists" });
      return;
    }
    throw error;
  }
});

router.get("/analytics", async (req, res): Promise<void> => {
  const parsed = GetAnalyticsQueryParams.safeParse(req.query);
  if (!parsed.success || !validDateRange(parsed.data)) {
    res.status(400).json({ error: parsed.success ? "Invalid date range" : parsed.error.message });
    return;
  }

  const [expenses, categories] = await Promise.all([
    db
      .select({
        date: expensesTable.date,
        categoryId: expensesTable.categoryId,
        categoryName: categoriesTable.name,
        categoryColor: categoriesTable.color,
        categoryBudget: categoriesTable.budgetLimit,
        amount: expensesTable.amount,
        recurring: expensesTable.recurring,
      })
      .from(expensesTable)
      .innerJoin(categoriesTable, eq(expensesTable.categoryId, categoriesTable.id))
      .where(and(...filterConditions(parsed.data))),
    db.select().from(categoriesTable).orderBy(categoriesTable.name),
  ]);

  const amounts = expenses.map((expense) => expense.amount).sort((a, b) => a - b);
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const count = amounts.length;
  const average = count ? total / count : 0;
  const middle = Math.floor(count / 2);
  const median = count
    ? count % 2
      ? amounts[middle]!
      : (amounts[middle - 1]! + amounts[middle]!) / 2
    : 0;
  const variance = count
    ? amounts.reduce((sum, amount) => sum + (amount - average) ** 2, 0) / count
    : 0;
  const percentile75 = count
    ? (() => {
        const position = (count - 1) * 0.75;
        const lower = Math.floor(position);
        const upper = Math.ceil(position);
        return amounts[lower]! + (amounts[upper]! - amounts[lower]!) * (position - lower);
      })()
    : 0;

  const categoryTotals = new Map<number, number>();
  const monthlyTotals = new Map<string, number>();
  const dailyTotals = new Map<string, number>();
  let recurringTotal = 0;
  for (const expense of expenses) {
    categoryTotals.set(expense.categoryId, (categoryTotals.get(expense.categoryId) ?? 0) + expense.amount);
    monthlyTotals.set(expense.date.slice(0, 7), (monthlyTotals.get(expense.date.slice(0, 7)) ?? 0) + expense.amount);
    dailyTotals.set(expense.date, (dailyTotals.get(expense.date) ?? 0) + expense.amount);
    if (expense.recurring) recurringTotal += expense.amount;
  }

  const categoryBreakdown = categories
    .filter((category) => !parsed.data.categoryId || category.id === parsed.data.categoryId)
    .map((category) => {
      const amount = categoryTotals.get(category.id) ?? 0;
      return {
        categoryId: category.id,
        name: category.name,
        color: category.color,
        amount,
        budget: category.budgetLimit,
        utilization: category.budgetLimit > 0 ? (amount / category.budgetLimit) * 100 : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const expenseRows = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  const firstDay = parsed.data.startDate ?? expenseRows[0]?.date;
  const lastDay = parsed.data.endDate ?? expenseRows.at(-1)?.date;
  const spanDays =
    firstDay && lastDay
      ? Math.max(1, Math.floor((Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${firstDay}T00:00:00Z`)) / 86_400_000) + 1)
      : 1;
  const topCategory = categoryBreakdown.find((category) => category.amount > 0)?.name ?? null;

  const analytics = {
    total,
    count,
    average,
    median,
    standardDeviation: Math.sqrt(variance),
    minimum: count ? amounts[0]! : 0,
    maximum: count ? amounts.at(-1)! : 0,
    percentile75,
    averageDaily: total / spanDays,
    recurringTotal,
    nonRecurringTotal: total - recurringTotal,
    topCategory,
    monthly: [...monthlyTotals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount })),
    categories: categoryBreakdown,
    daily: [...dailyTotals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount })),
  };
  res.json(GetAnalyticsResponse.parse(analytics));
});

router.get("/export.csv", async (req, res): Promise<void> => {
  const parsed = GetExpensesQueryParams.safeParse(req.query);
  if (!parsed.success || !validDateRange(parsed.data)) {
    res.status(400).json({ error: parsed.success ? "Invalid date range" : parsed.error.message });
    return;
  }
  const expenses = await selectExpenses(parsed.data);
  const cell = (value: unknown) => {
    const raw = String(value ?? "");
    const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const lines = [
    ["Date", "Category", "Amount", "Description", "Payment method", "Recurring"].map(cell).join(","),
    ...expenses.map((expense) =>
      [
        expense.date,
        expense.categoryName,
        expense.amount.toFixed(2),
        expense.description,
        expense.paymentMethod,
        expense.recurring ? "Yes" : "No",
      ]
        .map(cell)
        .join(","),
    ),
  ];
  res
    .status(200)
    .type("text/csv")
    .attachment("expenses.csv")
    .send(`\uFEFF${lines.join("\r\n")}`);
});

export default router;
