"""
Granular permission definitions.

Resource naming: "{page}.{element}"
Actions: "view", "export", "manage"
"""

RESOURCES = {
    "dashboard": [
        "dashboard.kpi_revenue",
        "dashboard.kpi_orders",
        "dashboard.kpi_gross_margin",
        "dashboard.kpi_receivables",
        "dashboard.kpi_helpdesk",
        "dashboard.kpi_crm",
        "dashboard.kpi_manufacturing",
        "dashboard.kpi_projects",
        "dashboard.revenue_chart",
        "dashboard.orders_chart",
        "dashboard.top_products",
        "dashboard.top_customers",
        "dashboard.helpdesk_chart",
        "dashboard.crm_pipeline_chart",
        "dashboard.manufacturing_chart",
    ],
    "sales": [
        "sales.revenue_chart",
        "sales.orders_chart",
        "sales.order_table",
        "sales.order_detail",
        "sales.by_product",
        "sales.by_customer",
        "sales.by_salesperson",
        "sales.export_csv",
        "sales.export_excel",
        "sales.export_pdf",
    ],
    "procurement": [
        "procurement.orders_chart",
        "procurement.spend_chart",
        "procurement.order_table",
        "procurement.order_detail",
        "procurement.by_vendor",
        "procurement.by_product",
        "procurement.export_csv",
        "procurement.export_excel",
        "procurement.export_pdf",
    ],
    "accounting": [
        "accounting.pl_statement",
        "accounting.balance_sheet",
        "accounting.receivable_aging",
        "accounting.payable_aging",
        "accounting.journal_entries",
        "accounting.tax_summary",
        "accounting.export_csv",
        "accounting.export_excel",
        "accounting.export_pdf",
    ],
    "inventory": [
        "inventory.stock_levels",
        "inventory.stock_chart",
        "inventory.movements",
        "inventory.valuation",
        "inventory.by_warehouse",
        "inventory.by_product",
        "inventory.grading",
        "inventory.export_csv",
        "inventory.export_excel",
        "inventory.export_pdf",
    ],
    "crm": [
        "crm.summary",
        "crm.pipeline",
        "crm.leads_chart",
        "crm.lead_table",
        "crm.export_csv",
        "crm.export_excel",
        "crm.export_pdf",
    ],
    "helpdesk": [
        "helpdesk.summary",
        "helpdesk.tickets_chart",
        "helpdesk.by_stage",
        "helpdesk.ticket_table",
        "helpdesk.export_csv",
        "helpdesk.export_excel",
        "helpdesk.export_pdf",
    ],
    "projects": [
        "projects.summary",
        "projects.by_project",
        "projects.tasks_chart",
        "projects.task_table",
        "projects.export_csv",
        "projects.export_excel",
        "projects.export_pdf",
    ],
    "customers": [
        "customers.summary",
        "customers.top_customers",
        "customers.customers_chart",
        "customers.customer_table",
        "customers.export_csv",
        "customers.export_excel",
        "customers.export_pdf",
    ],
    "manufacturing": [
        "manufacturing.summary",
        "manufacturing.production_chart",
        "manufacturing.top_products",
        "manufacturing.order_table",
        "manufacturing.export_csv",
        "manufacturing.export_excel",
        "manufacturing.export_pdf",
    ],
    "reports": [
        "reports.builder",
        "reports.saved",
    ],
    "alerts": [
        "alerts.view",
        "alerts.create",
        "alerts.manage",
    ],
    "settings": [
        "settings.users",
        "settings.roles",
        "settings.permissions",
        "settings.scheduled_reports",
        "settings.api_keys",
    ],
}

ACTIONS = ["view", "export", "manage"]


def _dept_perms(view_export_pages: list[str], view_only_pages: list[str] | None = None):
    """Build permission tuples for department roles.

    view_export_pages: modules the department can view and export
    view_only_pages: modules they can view but not export (e.g. dashboard)
    """
    perms = []
    for page in (view_only_pages or []):
        for resource in RESOURCES.get(page, []):
            if not resource.endswith(("_csv", "_excel", "_pdf")):
                perms.append((resource, "view"))
    for page in view_export_pages:
        for resource in RESOURCES.get(page, []):
            perms.append((resource, "view"))
            perms.append((resource, "export"))
    return perms


DEFAULT_ROLES = {
    "Admin": {
        "description": "Full access to all features and settings",
        "permissions": [
            (resource, action)
            for page_resources in RESOURCES.values()
            for resource in page_resources
            for action in ACTIONS
        ],
    },
    "Analyst": {
        "description": "View and export all reports, no settings access",
        "permissions": [
            (resource, action)
            for page, page_resources in RESOURCES.items()
            if page != "settings"
            for resource in page_resources
            for action in ["view", "export"]
        ],
    },
    "Viewer": {
        "description": "View dashboard and reports only, no export",
        "permissions": [
            (resource, "view")
            for page, page_resources in RESOURCES.items()
            if page not in ("settings", "reports", "alerts")
            for resource in page_resources
            if not resource.endswith(("_csv", "_excel", "_pdf"))
        ],
    },
    "Sales Team": {
        "description": "Sales, customers, and CRM with exports; dashboard view only",
        "permissions": _dept_perms(
            view_export_pages=["sales", "customers", "crm"],
            view_only_pages=["dashboard"],
        ),
    },
    "Finance": {
        "description": "Accounting and procurement with exports; dashboard and sales view only",
        "permissions": _dept_perms(
            view_export_pages=["accounting", "procurement"],
            view_only_pages=["dashboard", "sales"],
        ),
    },
    "Warehouse": {
        "description": "Inventory and manufacturing with exports; dashboard and procurement view only",
        "permissions": _dept_perms(
            view_export_pages=["inventory", "manufacturing"],
            view_only_pages=["dashboard", "procurement"],
        ),
    },
    "Support": {
        "description": "Helpdesk and CRM with exports; dashboard and customers view only",
        "permissions": _dept_perms(
            view_export_pages=["helpdesk", "crm"],
            view_only_pages=["dashboard", "customers"],
        ),
    },
    "Project Manager": {
        "description": "Projects with exports; dashboard, manufacturing, and helpdesk view only",
        "permissions": _dept_perms(
            view_export_pages=["projects"],
            view_only_pages=["dashboard", "manufacturing", "helpdesk"],
        ),
    },
}
