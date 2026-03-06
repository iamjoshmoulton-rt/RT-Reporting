"""Budget data from Odoo crossovered_budget for KPI comparison."""

import json
from datetime import date

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.odoo_models.budget import CrossoveredBudget, CrossoveredBudgetLine, AccountBudgetPost


def _get_mapping() -> dict[str, str]:
    """Return budget post name -> KPI key from config."""
    raw = get_settings().budget_kpi_mapping or "{}"
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


async def get_budget_for_period(
    db: AsyncSession,
    date_from: date,
    date_to: date,
) -> dict[str, float]:
    """
    Sum planned_amount from Odoo budget lines overlapping [date_from, date_to],
    grouped by budget post name, then map to KPI keys via config.
    Returns { kpi_key: budget_value }; KPIs with no mapping or no lines are omitted.
    """
    mapping = _get_mapping()
    if not mapping:
        return {}

    # Lines overlapping the report range: line.date_from <= date_to AND line.date_to >= date_from
    # Join to account_budget_post to get post name; optionally to crossovered_budget to filter state
    Line = CrossoveredBudgetLine
    Post = AccountBudgetPost
    Budget = CrossoveredBudget

    q = (
        select(Post.name, func.coalesce(func.sum(Line.planned_amount), 0).label("total"))
        .select_from(Line)
        .join(Post, Line.general_budget_id == Post.id)
        .join(Budget, Line.crossovered_budget_id == Budget.id)
        .where(
            Line.date_from <= date_to,
            Line.date_to >= date_from,
            Budget.state.in_(["confirm", "done"]),
        )
        .group_by(Post.id, Post.name)
    )
    result = await db.execute(q)
    by_post_name = {row.name: float(row.total) for row in result.all() if row.name}

    out: dict[str, float] = {}
    for post_name, kpi_key in mapping.items():
        if kpi_key and post_name in by_post_name:
            out[kpi_key] = by_post_name[post_name]
    return out
