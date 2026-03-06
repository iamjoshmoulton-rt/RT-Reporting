import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

from app.config import get_settings


async def send_email(
    to: list[str],
    subject: str,
    html_body: str,
    attachments: list[tuple[str, bytes, str]] | None = None,
):
    """
    Send an email with optional attachments.
    attachments: list of (filename, content_bytes, mime_type)
    """
    settings = get_settings()

    msg = MIMEMultipart("mixed")
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject

    html_part = MIMEText(html_body, "html")
    msg.attach(html_part)

    if attachments:
        for filename, content, mime_type in attachments:
            main_type, sub_type = mime_type.split("/", 1)
            part = MIMEBase(main_type, sub_type)
            part.set_payload(content)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", f"attachment; filename={filename}")
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
