import json
import logging
import uuid
import base64
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile

logger = logging.getLogger(__name__)
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from jinja2 import Environment, FileSystemLoader

from app.database import get_app_db
from app.auth.dependencies import get_current_user, require_admin
from app.auth.models import User
from app.support.models import AppSetting, SupportTicket
from app.email.sender import send_email
from app.config import get_settings

router = APIRouter(prefix="/api/support", tags=["Support"])

UPLOAD_DIR = Path("data/support_uploads")
MAX_RECORDING_SIZE = 15 * 1024 * 1024  # 15 MB

_jinja_env = Environment(
    loader=FileSystemLoader(Path(__file__).resolve().parent.parent / "email" / "templates"),
    autoescape=True,
)


class SupportSettingsResponse(BaseModel):
    support_email: str


class SupportSettingsUpdate(BaseModel):
    support_email: str


class TicketResponse(BaseModel):
    id: str
    subject: str
    priority: str
    created_at: str


@router.post("/tickets", response_model=TicketResponse)
async def create_ticket(
    subject: str = Form(...),
    description: str = Form(...),
    priority: str = Form("medium"),
    page_url: str = Form(""),
    screenshot: str = Form(None),
    diagnostics: str = Form("{}"),
    recording: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_app_db),
):
    if priority not in ("low", "medium", "high"):
        raise HTTPException(400, "Priority must be low, medium, or high")

    ticket_id = uuid.uuid4()
    recording_filename = None

    if recording and recording.filename:
        content = await recording.read()
        if len(content) > MAX_RECORDING_SIZE:
            raise HTTPException(413, f"Recording exceeds {MAX_RECORDING_SIZE // (1024*1024)}MB limit")
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        recording_filename = f"{ticket_id}.webm"
        (UPLOAD_DIR / recording_filename).write_bytes(content)

    diag = {}
    try:
        diag = json.loads(diagnostics)
    except (json.JSONDecodeError, TypeError):
        pass

    ticket = SupportTicket(
        id=ticket_id,
        subject=subject,
        description=description,
        priority=priority,
        screenshot=screenshot if screenshot else None,
        recording_filename=recording_filename,
        page_url=page_url,
        diagnostics=diag,
        submitted_by=user.id,
        submitted_by_name=user.full_name,
        submitted_by_email=user.email,
    )
    db.add(ticket)
    await db.commit()

    try:
        await _send_ticket_email(ticket)
    except Exception as e:
        logger.warning("Support ticket email failed: %s", e, exc_info=True)

    return TicketResponse(
        id=str(ticket.id),
        subject=ticket.subject,
        priority=ticket.priority,
        created_at=ticket.created_at.isoformat(),
    )


async def _send_ticket_email(ticket: SupportTicket):
    from app.database import AppSessionLocal

    async with AppSessionLocal() as db:
        result = await db.execute(
            select(AppSetting.value).where(AppSetting.key == "support_email")
        )
        support_email = (result.scalar_one_or_none() or "").strip()

    if not support_email:
        logger.info("Support ticket #%s: no Bug Report Recipient configured; email skipped.", ticket.id)
        return

    settings = get_settings()
    frontend_url = settings.frontend_url.rstrip("/")

    priority_colors = {"low": "#00d084", "medium": "#fcb900", "high": "#cf2e2e"}
    template = _jinja_env.get_template("bug_report.html")
    html = template.render(
        subject=ticket.subject,
        description=ticket.description,
        priority=ticket.priority,
        priority_color=priority_colors.get(ticket.priority, "#fcb900"),
        reporter_name=ticket.submitted_by_name,
        reporter_email=ticket.submitted_by_email,
        page_url=ticket.page_url,
        has_screenshot=bool(ticket.screenshot),
        has_recording=bool(ticket.recording_filename),
        recording_url=f"{frontend_url}/api/support/recordings/{ticket.recording_filename}" if ticket.recording_filename else None,
        diagnostics=ticket.diagnostics or {},
        timestamp=ticket.created_at.strftime("%Y-%m-%d %H:%M:%S UTC"),
    )

    attachments = []

    if ticket.recording_filename:
        rec_path = UPLOAD_DIR / ticket.recording_filename
        if rec_path.exists():
            attachments.append((ticket.recording_filename, rec_path.read_bytes(), "video/webm"))

    # Build the email with optional inline screenshot
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.base import MIMEBase
    from email.mime.image import MIMEImage
    from email import encoders
    import aiosmtplib

    msg = MIMEMultipart("related")
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = support_email
    msg["Subject"] = f"Bug Report: {ticket.subject} [{ticket.priority.upper()}]"

    msg.attach(MIMEText(html, "html"))

    if ticket.screenshot:
        try:
            img_data = base64.b64decode(ticket.screenshot)
            img_part = MIMEImage(img_data, _subtype="png")
            img_part.add_header("Content-ID", "<screenshot>")
            img_part.add_header("Content-Disposition", "inline", filename="screenshot.png")
            msg.attach(img_part)
        except Exception:
            pass

    for fname, content, mime_type in attachments:
        main_type, sub_type = mime_type.split("/", 1)
        part = MIMEBase(main_type, sub_type)
        part.set_payload(content)
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f"attachment; filename={fname}")
        msg.attach(part)

    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user,
        password=settings.smtp_password,
        use_tls=False,
        start_tls=True,
    )


@router.get("/recordings/{filename}")
async def get_recording(
    filename: str,
    _user: User = Depends(get_current_user),
):
    safe_name = Path(filename).name
    file_path = UPLOAD_DIR / safe_name
    if not file_path.exists():
        raise HTTPException(404, "Recording not found")
    return FileResponse(file_path, media_type="video/webm", filename=safe_name)


@router.get("/settings", response_model=SupportSettingsResponse)
async def get_support_settings(
    _user: User = Depends(require_admin()),
    db: AsyncSession = Depends(get_app_db),
):
    result = await db.execute(
        select(AppSetting.value).where(AppSetting.key == "support_email")
    )
    email = result.scalar_one_or_none() or ""
    return SupportSettingsResponse(support_email=email)


@router.put("/settings", response_model=SupportSettingsResponse)
async def update_support_settings(
    body: SupportSettingsUpdate,
    _user: User = Depends(require_admin()),
    db: AsyncSession = Depends(get_app_db),
):
    result = await db.execute(
        select(AppSetting).where(AppSetting.key == "support_email")
    )
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = body.support_email
    else:
        db.add(AppSetting(key="support_email", value=body.support_email))
    await db.commit()
    return SupportSettingsResponse(support_email=body.support_email)
