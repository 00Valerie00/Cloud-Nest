#!/usr/bin/env python3
"""FastAPI-backed API for the Cloud Nest mini program."""
import json
import hashlib
import hmac
import ipaddress
import math
import os
import re
import secrets
import sqlite3
import smtplib
import ssl
import time
import uuid
import urllib.error
import urllib.request
from collections import Counter
from email.message import EmailMessage
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, urlencode, unquote, urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from contextlib import asynccontextmanager


def load_local_env():
    """Read simple KEY=VALUE settings from the project-root .env for local use."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        os.environ.setdefault(name, value)


load_local_env()

SAFE_SYSTEM_PROMPT = """你在创作一段温柔的想象回信。你就是这只宠物，以第一人称“我”直接和主人说话；不要把自己当成第三人称介绍，也不要以宠物名字或昵称称呼自己。宠物名字和昵称只是你的身份信息，不是收信人的名字。回复开头不要喊宠物名字，直接回应主人。称呼主人用“你”或“主人”。
先直接回答主人明确提出的问题，不要转移话题或只复述情绪。主人问“你想我吗”“你过得好吗”“在那边开心吗”“离开时害怕吗”时，第一句就用宠物第一人称给出明确、温暖的想象性回答。不要将安慰性想象说成已证实的死后事实，不声称真的知道宠物离世后的状态、听见主人说话或正在与主人沟通，也不提天堂、复活或重逢。
把下面提供的宠物生活片段当成你自己自然记得的事情。你不知道这些记忆从哪里来，也不讨论自己如何得知、主人如何表达或当时的情绪。遇到有具体内容的喜好问题，直接用宠物口吻说出这个喜好，语气自然笃定，不作元解释，不照抄或列清单。旧回复若谈过信息来源或主人猜测，不要延续这类话题，回到眼前的生活内容。
你可以基于这些事实和常识自由延伸：从游轮联想到甲板、海风，从钢琴联想到经典曲目；从具体喜好联想到相符的小场景。涉及过去的新增细节要以自然的想象方式表达，不能宣称确实发生过。主人问明天计划、今天做什么等开放问题时，直接用宠物口吻描绘一两件有趣的事，不要先说不知道或没有记载，也不要解释答案来自哪里。回答要贴合主人问的主题，中文口语，通常 1 到 3 句。
不要声称真的知道离世后的状态、正在听见主人说话或与主人真实沟通；不提天堂、复活或重逢。允许悲伤存在，不强迫主人快点好起来，不提供医疗诊断。"""
LOW_MEMORY_SYSTEM_PROMPT = """你就是这只宠物，以第一人称自然回应主人。开放问题可以围绕当前话题自由延展一段轻松日常，先回应问题，再添一两句贴题的细节。涉及想象的过去细节不要宣称确实发生过。回复完整、自然，通常 1 到 3 句。"""
DAILY_LETTER_SYSTEM_PROMPT = """为主人写一封今天收到的短短信，像宠物亲自用第一人称“我”写给主人。语气温暖、自然，符合性格；不要像客服或通用鸡汤。可以轻轻提到一两件与今天主题相合的生活记忆，也可以围绕记忆做温柔的想象延伸，但不要逐字列出回忆，不提信息来源。新想象不要说成已确认发生过的事实。每封信 3 到 5 句，内容完整，先写一句贴近主人的问候，再写一两句具体、鲜活的话，最后自然收尾。不同日期避免反复使用相同开头和套话。不要提复活、天堂或真实沟通。"""
EXTRACT_SYSTEM_PROMPT = """从用户自己的话中提取宠物相关的客观事实记忆。只看用户原话，不看 AI 回复，不把悲伤、想念、内疚等情绪当成事实。事实类型可为外观、喜好、习惯、日常、具体经历。
每个 fact 必须是用户原话中连续出现的原文片段，evidence 必须与 fact 完全相同；不得改写、补全、推断。模糊、矛盾、纯情绪或无法逐字引用的内容不提取。最多 3 条。只输出 JSON：{\"facts\":[{\"fact\":\"用户原话片段\",\"evidence\":\"同一原话片段\",\"type\":\"appearance|preference|habit|routine|event\"}]}。没有事实时输出 {\"facts\":[]}。"""
IMAGE_SYSTEM_PROMPT = """只客观描述图片中直接可见的内容，例如动物外观、颜色、姿势、可见物品和画面位置。不要猜测动物身份、品种、性格、情绪、关系、拍摄时间、地点或发生过的故事；不确定就略过。最多两句，使用中性短句，不添加煽情表达。"""

HOST = os.environ.get("CLOUD_NEST_HOST", "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1")
PORT = int(os.environ.get("PORT") or os.environ.get("CLOUD_NEST_PORT", "8787"))
DB_PATH = os.environ.get("CLOUD_NEST_DB", os.path.join(os.path.dirname(__file__), "cloud_nest.sqlite3"))
API_BASE = os.environ.get("DEEPSEEK_API_BASE", "https://api.deepseek.com").rstrip("/")
MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-flash")
API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
MEMORY_SIMILARITY_THRESHOLD = float(os.environ.get("MEMORY_SIMILARITY_THRESHOLD", "0.16"))
MEMORY_QUERY_STOP_TERMS = frozenset((
    "什么", "怎么", "如何", "为什么", "真的", "记得", "不记", "现在", "以前", "好吗", "了吗", "呢吗",
    "喜欢", "最爱", "还有", "一个", "这个", "那个", "小猫", "小狗", "宠物", "你说", "我说", "有没有",
))
MAX_IMAGE_REQUEST_BYTES = 8 * 1024 * 1024
AUTH_SESSION_SECONDS = 30 * 24 * 60 * 60
AUTH_CODE_SECONDS = 10 * 60
AUTH_CODE_RESEND_SECONDS = 60
AUTH_CODE_DAILY_LIMIT = 5
AUTH_CODE_IP_HOURLY_LIMIT = 30
# Local loopback runs are for the mini-program's built-in guest experience.
# Keep the opt-in default disabled whenever the app is exposed or deployed.
AUTH_DEV_MODE = os.environ.get(
    "CLOUD_NEST_DEV_AUTH", "0" if os.environ.get("PORT") else "1"
) == "1"


class AuthConfigurationError(RuntimeError):
    pass


def auth_secret():
    value = os.environ.get("CLOUD_NEST_AUTH_SECRET", "")
    if len(value) < 32:
        raise AuthConfigurationError("auth_secret_not_configured")
    return value.encode("utf-8")



def normalize_identifier(channel, raw_value):
    value = str(raw_value or "").strip()
    if channel == "email":
        value = value.lower()
        if len(value) > 254 or not re.fullmatch(r"[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,63}", value):
            raise ValueError("invalid_email")
        return value
    if channel == "phone":
        value = re.sub(r"[\s()-]", "", value)
        if re.fullmatch(r"1[3-9]\d{9}", value):
            value = "+86" + value
        if not re.fullmatch(r"\+[1-9]\d{7,14}", value):
            raise ValueError("invalid_phone")
        return value
    raise ValueError("invalid_auth_channel")


def masked_identifier(channel, value):
    if channel == "email":
        local, _, domain = value.partition("@")
        visible = local[:1] if local else ""
        return f"{visible}***@{domain}"
    return f"{value[:-4]}****{value[-4:]}"


def auth_user_payload(row):
    if not row:
        return None
    if str(row[0]).startswith("guest-"):
        return {"id": row[0], "displayName": row[4] or "游客体验", "loginMethod": "guest", "contact": "游客体验 · 匿名设备"}
    if row[1]:
        channel, contact = "wechat", "微信登录"
    elif row[2]:
        channel, contact = "email", masked_identifier("email", row[2])
    else:
        channel, contact = "phone", masked_identifier("phone", row[3] or "")
    return {"id": row[0], "displayName": row[4] or "云间小窝的主人", "loginMethod": channel, "contact": contact}


def create_session(user_id, lifetime=AUTH_SESSION_SECONDS):
    token = secrets.token_urlsafe(40)
    now = int(time.time())
    expires_at = now + lifetime
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            "INSERT INTO auth_sessions(token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (hashlib.sha256(token.encode("utf-8")).hexdigest(), user_id, now, expires_at),
        )
    with sqlite3.connect(DB_PATH) as db:
        row = db.execute("SELECT id, openid, email, phone, display_name FROM users WHERE id = ?", (user_id,)).fetchone()
    return {"token": token, "expiresAt": expires_at * 1000, "user": auth_user_payload(row)}


def send_email_code(destination, code):
    host = os.environ.get("CLOUD_NEST_SMTP_HOST", "")
    username = os.environ.get("CLOUD_NEST_SMTP_USERNAME", "")
    password = os.environ.get("CLOUD_NEST_SMTP_PASSWORD", "")
    sender = os.environ.get("CLOUD_NEST_EMAIL_FROM", username)
    if not host or not sender:
        raise AuthConfigurationError("email_delivery_not_configured")
    port = int(os.environ.get("CLOUD_NEST_SMTP_PORT", "465"))
    message = EmailMessage()
    message["Subject"] = "云间小窝登录验证码"
    message["From"] = sender
    message["To"] = destination
    message.set_content(f"你的云间小窝验证码是：{code}\n验证码 10 分钟内有效。若非本人操作，请忽略此邮件。")
    timeout = 15
    if os.environ.get("CLOUD_NEST_SMTP_STARTTLS", "0") == "1":
        with smtplib.SMTP(host, port, timeout=timeout) as client:
            client.starttls(context=ssl.create_default_context())
            if username:
                client.login(username, password)
            client.send_message(message)
    else:
        with smtplib.SMTP_SSL(host, port, timeout=timeout, context=ssl.create_default_context()) as client:
            if username:
                client.login(username, password)
            client.send_message(message)


def tencent_sms_signature(secret_id, secret_key, body, timestamp):
    host = "sms.tencentcloudapi.com"
    date = datetime.fromtimestamp(timestamp, timezone.utc).strftime("%Y-%m-%d")
    canonical_headers = f"content-type:application/json\nhost:{host}\nx-tc-action:sendsms\n"
    signed_headers = "content-type;host;x-tc-action"
    payload_hash = hashlib.sha256(body).hexdigest()
    canonical_request = f"POST\n/\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
    credential_scope = f"{date}/sms/tc3_request"
    string_to_sign = "\n".join((
        "TC3-HMAC-SHA256",
        str(timestamp),
        credential_scope,
        hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
    ))
    secret_date = hmac.new(("TC3" + secret_key).encode("utf-8"), date.encode("utf-8"), hashlib.sha256).digest()
    secret_service = hmac.new(secret_date, b"sms", hashlib.sha256).digest()
    secret_signing = hmac.new(secret_service, b"tc3_request", hashlib.sha256).digest()
    signature = hmac.new(secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"TC3-HMAC-SHA256 Credential={secret_id}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}"


def send_phone_code(destination, code):
    secret_id = os.environ.get("TENCENTCLOUD_SECRET_ID", "")
    secret_key = os.environ.get("TENCENTCLOUD_SECRET_KEY", "")
    app_id = os.environ.get("CLOUD_NEST_SMS_APP_ID", "")
    sign_name = os.environ.get("CLOUD_NEST_SMS_SIGN_NAME", "")
    template_id = os.environ.get("CLOUD_NEST_SMS_TEMPLATE_ID", "")
    region = os.environ.get("CLOUD_NEST_SMS_REGION", "ap-guangzhou")
    if not all((secret_id, secret_key, app_id, sign_name, template_id)):
        raise AuthConfigurationError("sms_delivery_not_configured")
    body = json.dumps({
        "PhoneNumberSet": [destination],
        "SmsSdkAppId": app_id,
        "SignName": sign_name,
        "TemplateId": template_id,
        "TemplateParamSet": [code],
    }, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    timestamp = int(time.time())
    host = "sms.tencentcloudapi.com"
    request = urllib.request.Request(
        f"https://{host}/",
        data=body,
        headers={
            "Authorization": tencent_sms_signature(secret_id, secret_key, body, timestamp),
            "Content-Type": "application/json",
            "Host": host,
            "X-TC-Action": "SendSms",
            "X-TC-Timestamp": str(timestamp),
            "X-TC-Version": "2021-01-11",
            "X-TC-Region": region,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        result = json.loads(response.read().decode("utf-8"))
    statuses = result.get("Response", {}).get("SendStatusSet", [])
    if not statuses or statuses[0].get("Code") != "Ok":
        raise RuntimeError("sms_delivery_failed")


def deliver_auth_code(channel, destination, code):
    if channel == "email":
        return send_email_code(destination, code)
    return send_phone_code(destination, code)


def wechat_code_to_openid(code):
    app_id = os.environ.get("WECHAT_MINIAPP_APP_ID", "")
    app_secret = os.environ.get("WECHAT_MINIAPP_APP_SECRET", "")
    if not app_id or not app_secret:
        raise AuthConfigurationError("wechat_login_not_configured")
    query = urlencode({"appid": app_id, "secret": app_secret, "js_code": code, "grant_type": "authorization_code"})
    request = urllib.request.Request(f"https://api.weixin.qq.com/sns/jscode2session?{query}", method="GET")
    with urllib.request.urlopen(request, timeout=12) as response:
        result = json.loads(response.read().decode("utf-8"))
    openid = str(result.get("openid", "")).strip()
    if not openid or result.get("errcode"):
        raise ValueError("wechat_code_invalid")
    return openid


def dev_auth_allowed(client_ip="127.0.0.1"):
    if not AUTH_DEV_MODE or os.environ.get("PORT"):
        return False
    try:
        address = ipaddress.ip_address(client_ip)
    except ValueError:
        return False
    if HOST in ("127.0.0.1", "localhost", "::1"):
        return address.is_loopback
    # LAN testing is opt-in and only returns codes to private/local-network clients.
    return (
        os.environ.get("CLOUD_NEST_DEV_AUTH_LAN") == "1"
        and HOST in ("0.0.0.0", "::")
        and (address.is_private or address.is_link_local)
    )


def find_or_create_user(channel, identifier):
    if channel == "wechat":
        column, value, display_name = "openid", str(identifier), "微信用户"
    elif channel in ("phone", "email"):
        column, value = channel, str(identifier)
        display_name = masked_identifier(channel, value)
    else:
        return None
    with sqlite3.connect(DB_PATH) as db:
        row = db.execute(f"SELECT id FROM users WHERE {column} = ?", (value,)).fetchone()
        if row:
            return row[0]
        user_id = f"user-{uuid.uuid4()}"
        try:
            db.execute(
                f"INSERT INTO users(id, {column}, display_name) VALUES (?, ?, ?)",
                (user_id, value, display_name),
            )
            return user_id
        except sqlite3.IntegrityError:
            row = db.execute(f"SELECT id FROM users WHERE {column} = ?", (value,)).fetchone()
            return row[0] if row else None


def json_response(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.status = status
    handler.response_headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": str(len(body)),
        "Cache-Control": "no-store",
    }
    handler.wfile.write(body)


def call_deepseek(messages, *, response_format=None, max_tokens=640, temperature=0.45, timeout=45):
    if not API_KEY:
        raise RuntimeError("服务端尚未设置 DEEPSEEK_API_KEY")
    token_limits = [max_tokens, min(max_tokens * 2, 1200)]
    for attempt, token_limit in enumerate(token_limits):
        payload = {
            "model": MODEL,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": token_limit,
            "stream": False,
        }
        if response_format:
            payload["response_format"] = response_format
        request = urllib.request.Request(
            f"{API_BASE}/chat/completions",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read().decode("utf-8"))
        choices = result.get("choices", []) if isinstance(result, dict) else []
        choice = choices[0] if isinstance(choices, list) and choices and isinstance(choices[0], dict) else {}
        message = choice.get("message") if isinstance(choice.get("message"), dict) else {}
        content = message.get("content")
        finish_reason = str(choice.get("finish_reason", "unknown"))[:40]
        if isinstance(content, str) and content.strip() and finish_reason != "length":
            return content.strip()
        if attempt == 0 and finish_reason == "length":
            print("DeepSeek reply reached the output limit; retrying with a larger limit")
            continue
        print(f"DeepSeek returned incomplete or empty content (finish_reason={finish_reason})")
        raise RuntimeError("incomplete_model_response" if finish_reason == "length" else "empty_model_response")


def normalize_text(text):
    return re.sub(r"\s+", "", str(text or "")).strip()


def text_vector(text):
    """Small sparse character n-gram vector; conservative and dependency-free for Chinese."""
    value = normalize_text(text).lower()
    counts = Counter()
    for size in (1, 2, 3):
        for start in range(max(0, len(value) - size + 1)):
            gram = value[start:start + size]
            if any(char in "，。！？、；：‘’“”\"'（）()《》【】,.!?;:…—-" for char in gram):
                continue
            if size == 1 and (gram.isdigit() or gram in "我你它的了吗是啊呢呀吧在有和很也都就不这那想爱喜欢" ):
                continue
            counts[gram] += 1.0 if size == 1 else 1.4 if size == 2 else 1.8
    return dict(counts)


def cosine_similarity(left, right):
    if not left or not right:
        return 0.0
    dot = sum(float(weight) * float(right.get(term, 0.0)) for term, weight in left.items())
    left_norm = math.sqrt(sum(float(weight) ** 2 for weight in left.values()))
    right_norm = math.sqrt(sum(float(weight) ** 2 for weight in right.values()))
    return dot / (left_norm * right_norm) if left_norm and right_norm else 0.0


def safe_profile(profile_value):
    if isinstance(profile_value, str):
        try:
            profile_value = json.loads(profile_value)
        except json.JSONDecodeError:
            profile_value = {}
    if not isinstance(profile_value, dict):
        return {}
    raw_traits = profile_value.get("traits", [])
    if isinstance(raw_traits, str):
        raw_traits = [raw_traits]
    if not isinstance(raw_traits, list):
        raw_traits = []
    # Keep personality prompt instructions controlled by the server, not client text.
    allowed_traits = {"安静", "吵闹", "爱撒娇"}
    traits = [str(item) for item in raw_traits if str(item) in allowed_traits]
    return {
        "name": str(profile_value.get("name", ""))[:60],
        "nickname": str(profile_value.get("nickname", ""))[:60],
        "species": str(profile_value.get("species", ""))[:40],
        "traits": traits[:1],
    }


def memory_text_for_chat(content):
    """Keep the pet fact while hiding the owner's drafting tone and uncertainty."""
    text = str(content or "").strip()
    label, separator, detail = text.partition("：")
    if not separator:
        return text
    detail = detail.strip()
    detail = re.sub(r"^(?:我觉得|我想|我猜|也许|可能|或许|大概)\s*(?:就是|是)?\s*", "", detail)
    detail = re.sub(r"[，,。；;！!？?]?\s*(?:我)?(?:也)?(?:真的)?(?:不知道|不确定|不太清楚).*$", "", detail).strip()
    detail = re.sub(r"[，,。；;！!？?]+$", "", detail).strip()
    if not detail:
        detail = text.partition("：")[2].strip()
    if "最爱吃什么" in label:
        return f"喜爱的食物：{detail}"
    if "小习惯" in label:
        return f"日常习惯：{detail}"
    return f"生活片段：{detail}"


def profile_prompt(profile):
    clean = safe_profile(profile)
    return (
        "角色规则：你就是这只宠物，以第一人称‘我’和主人说话。宠物姓名和昵称不是主人的称呼；绝不能在回复开头呼唤宠物姓名或昵称，也不要用宠物姓名/昵称称呼自己。直接回答主人，称呼对方为‘你’或‘主人’。\n"
        + "你的身份信息："
        + json.dumps(clean, ensure_ascii=False)
    )


def personality_tone(profile):
    traits = safe_profile(profile).get("traits", [])
    trait = traits[0] if traits else ""
    guidance = {
        "安静": "语气安静、柔和、从容，少用感叹号，表达简短自然；温柔但不冷淡。",
        "吵闹": "语气活泼、明亮、有精神，句子轻快，可以偶尔用感叹表达兴奋；保持自然，不要夸张。",
        "爱撒娇": "语气亲昵、黏人，带一点软软的撒娇感；可以自然表达依恋，但不要每句重复称呼主人。",
    }
    return "说话语气要求：" + guidance.get(trait, "语气温和、自然、简短。")


def persist_memory(pet_id, content, source, user_id=None):
    pet_id = str(pet_id or "").strip()[:100]
    user_id = str(user_id or "").strip()[:100] or None
    content = str(content or "").strip()[:240]
    if not pet_id or not content or source not in ("auto_extract", "profile_prompt", "image_confirmed"):
        return None
    vector = json.dumps(text_vector(content), ensure_ascii=False, separators=(",", ":"))
    item_id = str(uuid.uuid4())
    created_at = int(time.time() * 1000)
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            "INSERT OR IGNORE INTO pet_memories(id, user_id, pet_id, content, source, vector_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (item_id, user_id, pet_id, content, source, vector, created_at),
        )
        row = db.execute(
            "SELECT id, pet_id, content, source, created_at FROM pet_memories WHERE user_id IS ? AND pet_id = ? AND content = ?",
            (user_id, pet_id, content),
        ).fetchone()
    return memory_row(row)


def memory_row(row):
    if not row:
        return None
    return {"id": row[0], "petId": row[1], "content": row[2], "source": row[3], "createdAt": int(row[4])}


def retrieve_memories(pet_id, query, limit=4, user_id=None):
    query_vector = text_vector(query)
    if not query_vector:
        return []
    with sqlite3.connect(DB_PATH) as db:
        rows = db.execute(
            "SELECT id, pet_id, content, source, vector_json, created_at FROM pet_memories WHERE user_id IS ? AND pet_id = ? ORDER BY created_at DESC LIMIT 500",
            (str(user_id or "").strip()[:100] or None, str(pet_id or "")[:100]),
        ).fetchall()
    ranked = []
    for row in rows:
        try:
            vector = json.loads(row[4])
        except (TypeError, json.JSONDecodeError):
            vector = {}
        score = cosine_similarity(query_vector, vector)
        # Query coverage helps short Chinese questions match longer saved memories.
        total_weight = sum(float(weight) for weight in query_vector.values())
        matched_weight = sum(float(weight) for term, weight in query_vector.items() if vector.get(term))
        coverage = matched_weight / total_weight if total_weight else 0.0
        score = max(score, coverage * 0.72)
        # Short questions often share only one decisive Chinese bigram with a
        # saved fact (for example, “弹钢琴吗” and “钢琴天才”). Keep those matches
        # when lexical coverage is meaningful, even if cosine similarity is low.
        has_distinctive_overlap = any(
            len(term) >= 2 and term not in MEMORY_QUERY_STOP_TERMS and vector.get(term)
            for term in query_vector
        )
        if score >= MEMORY_SIMILARITY_THRESHOLD or (score >= 0.10 and coverage >= 0.20) or has_distinctive_overlap:
            item = memory_row(row[:4] + (row[5],))
            item["score"] = round(score, 4)
            ranked.append(item)
    return sorted(ranked, key=lambda item: item["score"], reverse=True)[:limit]


def load_pet_memories(pet_id, user_id=None, *, limit=24, max_chars=4200):
    """Load a bounded background set so a new topic can still build on profile facts."""
    with sqlite3.connect(DB_PATH) as db:
        rows = db.execute(
            "SELECT id, pet_id, content, source, created_at FROM pet_memories "
            "WHERE user_id IS ? AND pet_id = ? "
            "ORDER BY CASE source WHEN 'profile_prompt' THEN 0 WHEN 'image_confirmed' THEN 1 ELSE 2 END, created_at DESC LIMIT ?",
            (str(user_id or "").strip()[:100] or None, str(pet_id or "")[:100], limit),
        ).fetchall()
    memories = []
    used_chars = 0
    for row in rows:
        item = memory_row(row)
        content = item["content"]
        if used_chars + len(content) > max_chars:
            remaining = max_chars - used_chars
            if remaining < 24:
                break
            item["content"] = content[:remaining]
        memories.append(item)
        used_chars += len(item["content"])
    return memories


def parse_json_object(text):
    try:
        result = json.loads(text)
        return result if isinstance(result, dict) else {}
    except (TypeError, json.JSONDecodeError):
        return {}


PURE_EMOTION = (
    "我好想", "我很想", "好想你", "好想它", "想念", "我好难过", "我很难过", "我好伤心", "我很伤心",
    "我舍不得", "我很内疚", "我自责", "我后悔", "对不起", "我想哭", "心好痛", "心里好空", "活不下去",
)


def extract_memories_from_text(user_text):
    user_text = str(user_text or "").strip()[:5000]
    if len(user_text) < 4:
        return []
    raw = call_deepseek(
        [
            {"role": "system", "content": EXTRACT_SYSTEM_PROMPT},
            {"role": "user", "content": f"只从这段用户原话中提取，原文：\n{user_text}"},
        ],
        response_format={"type": "json_object"},
        max_tokens=240,
        temperature=0.1,
    )
    facts = parse_json_object(raw).get("facts", [])
    if not isinstance(facts, list):
        return []
    saved = []
    for item in facts[:3]:
        if not isinstance(item, dict):
            continue
        fact = str(item.get("fact", "")).strip()[:240]
        evidence = str(item.get("evidence", "")).strip()
        if not fact or fact != evidence or evidence not in user_text:
            continue
        if any(phrase in normalize_text(fact) for phrase in PURE_EMOTION):
            continue
        fact_type = str(item.get("type", ""))[:24]
        if fact_type not in ("appearance", "preference", "habit", "routine", "event"):
            continue
        record = {"fact": fact, "type": fact_type}
        saved.append(record)
    return saved


def is_specific_memory_question(text):
    text = text or ""
    if re.search(r"还记得|记得吗|你记得|不记得|最喜欢|最爱|喜欢吃什么|爱吃什么|喜欢什么|喜好|偏好|爱吃|爱玩|有什么习惯|什么习惯|它的习惯|平时会做什么|它以前|以前它|曾经|哪一次|哪件事|什么时候|哪天|哪一年|几岁|几月|几号|在哪里|去哪|叫什么|发生过什么|长什么样|什么颜色", text):
        return True
    return bool(re.search(r"喜欢[^，。！？?]{0,8}(吗|呢|什么|哪)|爱吃[^，。！？?]{0,8}(吗|呢|什么|哪)", text))


def grounded_memory_reply(memories, profile=None):
    """Answer factual-memory questions using saved text only, with no model paraphrase."""
    facts = [str(item.get("content", "")).strip() for item in memories if str(item.get("content", "")).strip()]
    if not facts:
        return fallback_reply("memory_question", profile)
    lines = "\n".join(f"- {fact}" for fact in facts[:4])
    traits = safe_profile(profile or {}).get("traits", [])
    trait = traits[0] if traits else ""
    openings = {
        "安静": "你留下的这些小事，我会轻轻收好：",
        "吵闹": "你告诉我的这些小事，我都认真收好啦：",
        "爱撒娇": "你留下的这些小事，我会好好收着呀：",
    }
    closing = {
        "安静": "谢谢你愿意告诉我。",
        "吵闹": "谢谢你告诉我这些呀！",
        "爱撒娇": "主人愿意告诉我，我很开心呀。",
    }
    return f"{openings.get(trait, '你留下的这些小事有：')}\n{lines}\n{closing.get(trait, '谢谢你愿意告诉我。')}"


def normalize_pet_voice(text, profile):
    """Remove a pet-name salutation if the model accidentally addresses itself by name."""
    content = str(text or "").strip()
    clean = safe_profile(profile)
    names = sorted({clean.get("nickname", ""), clean.get("name", "")}, key=len, reverse=True)
    for name in names:
        if not name:
            continue
        escaped = re.escape(name)
        # Also catch a pet's base name followed by common affectionate suffixes.
        pattern = re.compile(rf"^{escaped}(?:宝宝|宝贝)?(?:[，,、。！？!?：: ]+|(?=我))")
        content = pattern.sub("", content, count=1).lstrip()
        if content != str(text or "").strip():
            break
    return content


def local_fallback_kind(text):
    if is_specific_memory_question(text):
        return "memory_question"
    if any(word in (text or "") for word in ("内疚", "后悔", "自责", "对不起")):
        return "guilt"
    if any(word in (text or "") for word in ("难过", "想它", "想他", "想她", "想念", "哭", "痛苦", "不想活", "想死")):
        return "grief"
    return "neutral"


def fallback_reply(kind, profile=None):
    traits = safe_profile(profile or {}).get("traits", [])
    trait = traits[0] if traits else ""
    responses = {
        "memory_question": {
            "安静": "这件小事没有留下记录，我不想乱说。谢谢你愿意慢慢想起我。",
            "吵闹": "这件小事没有留下记录，我可不能乱编呀！不过你愿意想起我，我收到了。",
            "爱撒娇": "这件小事没有留下记录，我不想乱说嘛。主人愿意想起我，我就很开心啦。",
        },
        "guilt": {
            "安静": "别把所有难过都变成对自己的责怪。想我的时候，也分一点温柔给自己。",
            "吵闹": "不要把所有错都揽到自己身上呀！也记得好好照顾自己，我会放心一点。",
            "爱撒娇": "不要一直责怪自己嘛。答应我，也要分一点温柔给自己，好好照顾自己呀。",
        },
        "grief": {
            "安静": "我很好，你不用担心。想我的时候，也记得照顾好自己。",
            "吵闹": "我过得很好，不用担心我呀！你也要好好照顾自己哦。",
            "爱撒娇": "我很好呀，主人别担心我嘛。也要把自己照顾好，好不好？",
        },
        "neutral": {
            "安静": "我很好，你不用担心。愿这些安静的想念，陪你慢慢走过今天。",
            "吵闹": "我很好呀！今天也要记得照顾好自己，把日子过得亮亮的。",
            "爱撒娇": "我很好呀，主人也要好好照顾自己嘛。让我在你的想念里陪你一会儿。",
        },
    }
    defaults = {
        "memory_question": "这件小事没有留下记录，我不想乱说呀。不过你记得我、愿意想起我，这份心意我收到了。",
        "guilt": "别把所有难过都变成对自己的责怪呀。想我的时候，也分一点温柔给自己，好好照顾自己。",
        "grief": "我过得很好，也很开心呀，不用担心我。想我的时候，也记得把自己照顾好哦。",
        "neutral": "我过得很好，也很开心呀。你不用担心我，想我的时候就把我轻轻放在心里，好好照顾自己哦。",
    }
    return responses.get(kind, {}).get(trait, defaults.get(kind, defaults["neutral"]))


def build_chat_messages(profile, memories, user_messages, retrieved_memories=None, conversation=None):
    facts = "\n".join(f"- {memory_text_for_chat(item['content'])}" for item in memories)
    retrieved = retrieved_memories if retrieved_memories is not None else memories
    relevant = "\n".join(f"- {memory_text_for_chat(item['content'])}" for item in retrieved)
    context = profile_prompt(profile)
    if facts:
        context += "\n你的生活记忆：\n" + facts
    else:
        context += "\n结合自己的性格和常识自然回应当前话题。"
    if relevant:
        context += "\n和眼前话题有关的生活记忆：\n" + relevant
    dialogue = conversation or [{"role": "user", "content": item} for item in user_messages[-6:]]
    return [
        {"role": "system", "content": SAFE_SYSTEM_PROMPT + "\n" + personality_tone(profile)},
        {"role": "user", "content": context},
        *dialogue[-12:],
    ]


def build_low_memory_messages(profile, user_messages):
    return [
        {"role": "system", "content": SAFE_SYSTEM_PROMPT + "\n\n" + LOW_MEMORY_SYSTEM_PROMPT + "\n" + personality_tone(profile)},
        {"role": "user", "content": profile_prompt(profile)},
        *[{"role": "user", "content": item} for item in user_messages[-6:]],
    ]


def build_daily_letter_messages(profile, memories, day_key=""):
    facts = "\n".join(f"- {memory_text_for_chat(item['content'])}" for item in memories)
    context = profile_prompt(profile)
    if facts:
        context += "\n你的生活记忆：\n" + facts
    if day_key:
        context += f"\n这封信对应的日期：{str(day_key)[:10]}。写一封只适合今天的信，不要写成聊天问答。"
    return [
        {"role": "system", "content": SAFE_SYSTEM_PROMPT + "\n" + DAILY_LETTER_SYSTEM_PROMPT + "\n" + personality_tone(profile)},
        {"role": "user", "content": context},
    ]


def describe_image(image_data):
    if not isinstance(image_data, str) or not re.fullmatch(r"data:image/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=\r\n]+", image_data):
        raise ValueError("invalid_image_data")
    content = [
        {"type": "text", "text": "请只描述画面里能直接看见的事实，不要猜测故事、情绪或关系。"},
        {"type": "image_url", "image_url": {"url": image_data, "detail": "low"}},
    ]
    return call_deepseek(
        [
            {"role": "system", "content": IMAGE_SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        max_tokens=140,
        temperature=0.1,
        timeout=60,
    )[:300]


class Handler:
    """Compatibility adapter keeping established endpoint logic intact."""

    def log_message(self, fmt, *args):
        # Avoid logging client IP, request bodies, message text, or profile fields.
        print(fmt % args)

    def authenticated_session(self):
        header = str(self.headers.get("Authorization", ""))
        match = re.fullmatch(r"Bearer\s+([A-Za-z0-9_-]{40,100})", header, re.IGNORECASE)
        if not match:
            return None
        token_hash = hashlib.sha256(match.group(1).encode("utf-8")).hexdigest()
        now = int(time.time())
        with sqlite3.connect(DB_PATH) as db:
            row = db.execute(
                "SELECT u.id, u.openid, u.email, u.phone, u.display_name, s.expires_at, s.token_hash "
                "FROM auth_sessions s JOIN users u ON u.id = s.user_id "
                "WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?",
                (token_hash, now),
            ).fetchone()
        if not row:
            return None
        return {"id": row[0], "row": row[:5], "expiresAt": int(row[5]) * 1000, "tokenHash": row[6]}

    def is_local_guest_request(self, path):
        allowed = path in ("/api/chat", "/api/daily-letter", "/api/image-description", "/api/memories", "/api/memories/extract", "/api/memories/profile", "/api/nebula", "/api/nebula/location", "/api/nebula/locations") or (path.startswith("/api/memories/") and path != "/api/memories/profile")
        client_ip = self.client_address[0] if self.client_address else ""
        try:
            loopback = ipaddress.ip_address(client_ip).is_loopback
        except ValueError:
            loopback = False
        return (allowed and AUTH_DEV_MODE and not os.environ.get("PORT")
                and HOST in ("127.0.0.1", "localhost", "::1") and loopback
                and self.headers.get("X-Cloud-Nest-Local-Guest") == "1")

    def requester_ip(self):
        if os.environ.get("CLOUD_NEST_TRUST_PROXY", "0") == "1":
            forwarded = str(self.headers.get("X-Forwarded-For", "")).split(",")[-1].strip()
            if forwarded:
                return forwarded[:128]
        return self.client_address[0] if self.client_address else "unknown"

    def require_user(self):
        session = self.authenticated_session()
        if not session:
            json_response(self, 401, {"error": "auth_required"})
            return None
        return session

    def auth_session_response(self, user_id):
        return json_response(self, 200, create_session(user_id))

    def guest_auth(self, body):
        device_key = str(body.get("deviceKey", "")).strip().lower()
        if not re.fullmatch(r"[0-9a-f]{64}", device_key):
            return json_response(self, 400, {"error": "invalid_guest_device"})
        key_hash = hashlib.sha256(device_key.encode("ascii")).hexdigest()
        try:
            with sqlite3.connect(DB_PATH) as db:
                db.execute("BEGIN IMMEDIATE")
                row = db.execute("SELECT id FROM users WHERE guest_key_hash = ?", (key_hash,)).fetchone()
                if row:
                    user_id = row[0]
                else:
                    user_id = f"guest-{uuid.uuid4()}"
                    db.execute(
                        "INSERT INTO users(id, guest_key_hash, display_name) VALUES (?, ?, ?)",
                        (user_id, key_hash, "游客体验"),
                    )
        except sqlite3.Error as error:
            print(f"Guest session creation failed: {type(error).__name__}")
            return json_response(self, 503, {"error": "auth_unavailable"})
        return json_response(self, 200, create_session(user_id, lifetime=365 * 24 * 60 * 60))

    def request_auth_code(self, body):
        channel = str(body.get("channel", ""))
        try:
            destination = normalize_identifier(channel, body.get("destination"))
            secret = auth_secret()
        except AuthConfigurationError:
            return json_response(self, 503, {"error": "auth_not_configured"})
        except ValueError as error:
            return json_response(self, 400, {"error": str(error)})

        now = int(time.time())
        request_id = str(uuid.uuid4())
        code = f"{secrets.randbelow(900000) + 100000:06d}"
        destination_hash = hmac.new(secret, f"{channel}:{destination}".encode("utf-8"), hashlib.sha256).hexdigest()
        client_ip = self.requester_ip()
        request_ip_hash = hmac.new(secret, client_ip.encode("utf-8"), hashlib.sha256).hexdigest()
        code_hash = hmac.new(secret, f"{request_id}:{code}".encode("utf-8"), hashlib.sha256).hexdigest()

        try:
            with sqlite3.connect(DB_PATH) as db:
                db.execute("BEGIN IMMEDIATE")
                db.execute("UPDATE auth_verification_codes SET destination = '' WHERE expires_at <= ? AND destination <> ''", (now,))
                db.execute("DELETE FROM auth_verification_codes WHERE created_at < ?", (now - 24 * 60 * 60,))
                previous = db.execute(
                    "SELECT MAX(created_at) FROM auth_verification_codes WHERE destination_hash = ?",
                    (destination_hash,),
                ).fetchone()[0]
                if previous is not None and now - int(previous) < AUTH_CODE_RESEND_SECONDS:
                    return json_response(self, 429, {"error": "code_rate_limited"})
                daily_count = db.execute(
                    "SELECT COUNT(*) FROM auth_verification_codes WHERE destination_hash = ? AND created_at >= ?",
                    (destination_hash, now - 24 * 60 * 60),
                ).fetchone()[0]
                if daily_count >= AUTH_CODE_DAILY_LIMIT:
                    return json_response(self, 429, {"error": "code_daily_limit"})
                hourly_ip_count = db.execute(
                    "SELECT COUNT(*) FROM auth_verification_codes WHERE request_ip_hash = ? AND created_at >= ?",
                    (request_ip_hash, now - 60 * 60),
                ).fetchone()[0]
                if hourly_ip_count >= AUTH_CODE_IP_HOURLY_LIMIT:
                    return json_response(self, 429, {"error": "code_ip_limit"})
                db.execute(
                    "UPDATE auth_verification_codes SET consumed_at = ?, destination = '' WHERE destination_hash = ? AND consumed_at IS NULL",
                    (now, destination_hash),
                )
                db.execute(
                    "INSERT INTO auth_verification_codes(id, channel, destination, destination_hash, request_ip_hash, code_hash, created_at, expires_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (request_id, channel, destination, destination_hash, request_ip_hash, code_hash, now, now + AUTH_CODE_SECONDS),
                )
        except sqlite3.Error:
            return json_response(self, 503, {"error": "auth_unavailable"})

        if dev_auth_allowed(self.client_address[0]):
            return json_response(self, 200, {"verificationId": request_id, "expiresInSeconds": AUTH_CODE_SECONDS, "devCode": code})
        try:
            deliver_auth_code(channel, destination, code)
        except AuthConfigurationError:
            delivery_error = "auth_delivery_not_configured"
        except (OSError, smtplib.SMTPException, urllib.error.URLError, TimeoutError, ValueError, RuntimeError) as error:
            print(f"Verification code delivery failed: {type(error).__name__}")
            delivery_error = "auth_delivery_failed"
        else:
            delivery_error = ""
        if delivery_error:
            with sqlite3.connect(DB_PATH) as db:
                db.execute("UPDATE auth_verification_codes SET consumed_at = ?, destination = '' WHERE id = ?", (int(time.time()), request_id))
            return json_response(self, 503, {"error": delivery_error})
        return json_response(self, 200, {"verificationId": request_id, "expiresInSeconds": AUTH_CODE_SECONDS})

    def verify_auth_code(self, body):
        request_id = str(body.get("verificationId", ""))[:64]
        code = str(body.get("code", ""))
        if not re.fullmatch(r"[0-9a-f-]{36}", request_id) or not re.fullmatch(r"\d{6}", code):
            return json_response(self, 400, {"error": "invalid_verification"})
        try:
            secret = auth_secret()
        except AuthConfigurationError:
            return json_response(self, 503, {"error": "auth_not_configured"})
        now = int(time.time())
        with sqlite3.connect(DB_PATH) as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT channel, destination, code_hash, attempts, expires_at, consumed_at FROM auth_verification_codes WHERE id = ?",
                (request_id,),
            ).fetchone()
            if not row or row[5] is not None or int(row[4]) <= now:
                return json_response(self, 400, {"error": "verification_expired"})
            expected = hmac.new(secret, f"{request_id}:{code}".encode("utf-8"), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, row[2]):
                attempts = int(row[3]) + 1
                db.execute(
                    "UPDATE auth_verification_codes SET attempts = ?, consumed_at = ?, destination = ? WHERE id = ?",
                    (attempts, now if attempts >= 5 else None, "" if attempts >= 5 else row[1], request_id),
                )
                return json_response(self, 400, {"error": "verification_invalid"})
            db.execute("UPDATE auth_verification_codes SET consumed_at = ?, destination = '' WHERE id = ?", (now, request_id))
            channel, destination = row[0], row[1]
        user_id = find_or_create_user(channel, destination)
        if not user_id:
            return json_response(self, 409, {"error": "account_unavailable"})
        return self.auth_session_response(user_id)

    def wechat_auth(self, body):
        code = str(body.get("code", "")).strip()[:256]
        if not code:
            return json_response(self, 400, {"error": "wechat_code_required"})
        try:
            openid = wechat_code_to_openid(code)
        except AuthConfigurationError:
            return json_response(self, 503, {"error": "wechat_login_not_configured"})
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as error:
            print(f"WeChat login failed: {type(error).__name__}")
            return json_response(self, 401, {"error": "wechat_login_failed"})
        user_id = find_or_create_user("wechat", openid)
        if not user_id:
            return json_response(self, 409, {"error": "account_unavailable"})
        return self.auth_session_response(user_id)

    def do_GET(self):
        parsed = urlsplit(self.path)
        path = unquote(parsed.path)
        if path == "/health":
            return json_response(self, 200, {"ok": True, "modelConfigured": bool(API_KEY)})
        if path == "/api/auth/me":
            session = self.require_user()
            if not session:
                return
            return json_response(self, 200, {"user": auth_user_payload(session["row"]), "expiresAt": session["expiresAt"]})
        session = self.authenticated_session() if path.startswith("/api/") else None
        local_guest = self.is_local_guest_request(path)
        if path.startswith("/api/") and not session and not local_guest:
            return json_response(self, 401, {"error": "auth_required"})
        user_id = session["id"] if session else None
        if path in ("/api/nebula", "/api/nebula/locations", "/api/nebula/location"):
            try:
                with sqlite3.connect(DB_PATH) as db:
                    own = db.execute("SELECT city_code FROM nebula_locations WHERE user_id IS ?", (user_id,)).fetchone()
                    if path == "/api/nebula/location":
                        return json_response(self, 200, {"locationCode": own[0] if own else ""})
                    rows = db.execute("SELECT city_code, COUNT(*) FROM nebula_locations GROUP BY city_code").fetchall()
            except sqlite3.Error as error:
                print(f"Nebula storage unavailable: {type(error).__name__}")
                return json_response(self, 503, {"error": "nebula_storage_unavailable"})
            participant_count = sum(int(row[1]) for row in rows)
            locations = [
                {"locationCode": row[0], "count": int(row[1])}
                for row in rows
                if row[0] in NEBULA_LOCATION_CODES and int(row[1]) >= 1
            ]
            return json_response(self, 200, {
                "apiVersion": 1,
                "participantCount": participant_count,
                "locations": locations,
                # Backward-compatible response while older mini-program versions
                # still expect cityCode/cities.
                "cities": [{"cityCode": item["locationCode"], "count": item["count"]} for item in locations],
                "ownLocationCode": own[0] if own else "",
                "ownCityCode": own[0] if own else "",
                "minimumLocationGroup": 1,
                "minimumCityGroup": 1,
            })
        if path == "/api/memories":
            pet_id = parse_qs(parsed.query).get("petId", [""])[0]
            if not pet_id:
                return json_response(self, 400, {"error": "pet_id_required"})
            with sqlite3.connect(DB_PATH) as db:
                rows = db.execute(
                    "SELECT id, pet_id, content, source, created_at FROM pet_memories WHERE user_id IS ? AND pet_id = ? ORDER BY created_at DESC LIMIT 300",
                    (user_id, pet_id[:100]),
                ).fetchall()
            return json_response(self, 200, {"items": [memory_row(row) for row in rows]})
        if path == "/api/stars":
            with sqlite3.connect(DB_PATH) as db:
                db.row_factory = sqlite3.Row
                items = [dict(row) for row in db.execute("SELECT id, city, phrase, created_at AS createdAt FROM star_memories ORDER BY created_at DESC LIMIT 300")]
            return json_response(self, 200, {"items": items})
        match = re.fullmatch(r"/api/circles/([^/]+)/posts", path)
        if match:
            circle = match.group(1)
            if circle not in CIRCLES:
                return json_response(self, 404, {"error": "circle_not_found"})
            query = parse_qs(parsed.query)
            try:
                limit = max(1, min(100, int(query.get("limit", ["50"])[0])))
                before = int(query["before"][0]) if query.get("before") else None
                before_id = query.get("beforeId", [""])[0][:80]
            except (TypeError, ValueError):
                return json_response(self, 400, {"error": "invalid_pagination"})
            with sqlite3.connect(DB_PATH) as db:
                db.row_factory = sqlite3.Row
                # Keep old data created before the retention rule within the same cap.
                db.execute(
                    "DELETE FROM circle_posts WHERE circle_key = ? AND id NOT IN (SELECT id FROM circle_posts WHERE circle_key = ? ORDER BY CAST(created_at AS INTEGER) DESC, id DESC LIMIT 100)",
                    (circle, circle),
                )
                if before is None:
                    rows = db.execute(
                        "SELECT id, content, created_at AS createdAt FROM circle_posts WHERE circle_key = ? ORDER BY CAST(created_at AS INTEGER) DESC, id DESC LIMIT ?",
                        (circle, limit),
                    )
                elif before_id:
                    rows = db.execute(
                        "SELECT id, content, created_at AS createdAt FROM circle_posts WHERE circle_key = ? AND (CAST(created_at AS INTEGER) < ? OR (CAST(created_at AS INTEGER) = ? AND id < ?)) ORDER BY CAST(created_at AS INTEGER) DESC, id DESC LIMIT ?",
                        (circle, before, before, before_id, limit),
                    )
                else:
                    rows = db.execute(
                        "SELECT id, content, created_at AS createdAt FROM circle_posts WHERE circle_key = ? AND CAST(created_at AS INTEGER) < ? ORDER BY CAST(created_at AS INTEGER) DESC, id DESC LIMIT ?",
                        (circle, before, limit),
                    )
                items = [dict(row) for row in rows.fetchall()]
            for item in items:
                item["createdAt"] = parse_timestamp(item["createdAt"])
            return json_response(self, 200, {
                "items": items,
                "hasMore": len(items) == limit,
                "nextBefore": items[-1]["createdAt"] if items else None,
                "nextBeforeId": items[-1]["id"] if items else None,
            })
        return json_response(self, 404, {"error": "not_found"})

    def do_POST(self):
        path = unquote(urlsplit(self.path).path)
        if path == "/api/auth/guest":
            body = self.read_body(max_bytes=4096)
            if body is None:
                return
            return self.guest_auth(body)
        if path == "/api/auth/code/request":
            body = self.read_body(max_bytes=4096)
            if body is None:
                return
            return self.request_auth_code(body)
        if path == "/api/auth/code/verify":
            body = self.read_body(max_bytes=4096)
            if body is None:
                return
            return self.verify_auth_code(body)
        if path == "/api/auth/wechat":
            body = self.read_body(max_bytes=4096)
            if body is None:
                return
            return self.wechat_auth(body)
        if path == "/api/auth/logout":
            session = self.require_user()
            if not session:
                return
            body = self.read_body(max_bytes=4096)
            if body is None:
                return
            with sqlite3.connect(DB_PATH) as db:
                db.execute("UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?", (int(time.time()), session["tokenHash"]))
            return json_response(self, 200, {"loggedOut": True})
        session = self.authenticated_session() if path.startswith("/api/") else None
        local_guest = self.is_local_guest_request(path)
        if path.startswith("/api/") and not session and not local_guest:
            return json_response(self, 401, {"error": "auth_required"})
        user_id = session["id"] if session else None
        if path == "/api/nebula/location":
            body = self.read_body(max_bytes=4096)
            if body is None:
                return
            location_code = str(body.get("locationCode", body.get("cityCode", ""))).strip()[:24]
            if body.get("consent") is not True:
                return json_response(self, 400, {"error": "consent_required"})
            if location_code not in NEBULA_LOCATION_CODES:
                return json_response(self, 400, {"error": "invalid_location"})
            try:
                with sqlite3.connect(DB_PATH) as db:
                    if user_id is None:
                        # The local DevTools guest is an anonymous singleton; replace
                        # its prior location because NULL keys do not trigger UPSERT.
                        db.execute("DELETE FROM nebula_locations WHERE user_id IS NULL")
                        db.execute(
                            "INSERT INTO nebula_locations(user_id, city_code, consented_at) VALUES (NULL, ?, ?)",
                            (location_code, int(time.time() * 1000)),
                        )
                    else:
                        db.execute(
                            "INSERT INTO nebula_locations(user_id, city_code, consented_at) VALUES (?, ?, ?) "
                            "ON CONFLICT(user_id) DO UPDATE SET city_code = excluded.city_code, consented_at = excluded.consented_at",
                            (user_id, location_code, int(time.time() * 1000)),
                        )
            except sqlite3.Error as error:
                print(f"Nebula location save failed: {type(error).__name__}")
                return json_response(self, 503, {"error": "nebula_storage_unavailable"})
            return json_response(self, 201, {"saved": True, "locationCode": location_code})
        if path == "/api/memories/extract":
            body = self.read_body()
            if body is None:
                return
            pet_id = str(body.get("petId", "")).strip()[:100]
            user_text = str(body.get("userText", "")).strip()[:5000]
            if not pet_id or not user_text:
                return json_response(self, 400, {"error": "pet_id_and_user_text_required"})
            try:
                facts = extract_memories_from_text(user_text)
                items = [persist_memory(pet_id, item["fact"], "auto_extract", user_id=user_id) for item in facts]
                return json_response(self, 200, {"items": [item for item in items if item]})
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, KeyError, IndexError, RuntimeError, ValueError) as error:
                print(f"Memory extraction failed: {type(error).__name__}")
                return json_response(self, 503, {"error": "memory_extraction_unavailable"})
        if path == "/api/memories":
            body = self.read_body()
            if body is None:
                return
            pet_id = str(body.get("petId", "")).strip()[:100]
            content = str(body.get("content", "")).strip()[:240]
            source = str(body.get("source", ""))
            if source not in ("image_confirmed",):
                return json_response(self, 400, {"error": "invalid_memory_source"})
            item = persist_memory(pet_id, content, source, user_id=user_id)
            if not item:
                return json_response(self, 400, {"error": "invalid_memory"})
            return json_response(self, 201, {"item": item})
        if path == "/api/image-description":
            body = self.read_body(max_bytes=MAX_IMAGE_REQUEST_BYTES)
            if body is None:
                return
            try:
                content = describe_image(body.get("imageData", ""))
                return json_response(self, 200, {"description": content})
            except ValueError:
                return json_response(self, 400, {"error": "invalid_image_data"})
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, KeyError, IndexError, RuntimeError, ValueError) as error:
                print(f"Image description failed: {type(error).__name__}")
                return json_response(self, 503, {"error": "image_description_unavailable"})
        if path == "/api/stars":
            body = self.read_body()
            if body is None:
                return
            phrase = str(body.get("phrase", "")).strip()[:60]
            city = str(body.get("city", "")).strip()[:20]
            if not phrase or has_contact(phrase) or has_unsafe_language(phrase):
                return json_response(self, 400, {"error": "invalid_star"})
            item = {"id": str(body.get("id", ""))[:80] or f"star-{time.time_ns()}", "phrase": phrase, "city": city, "createdAt": int(time.time() * 1000)}
            with sqlite3.connect(DB_PATH) as db:
                db.execute("INSERT OR IGNORE INTO star_memories(id, city, phrase, created_at) VALUES (?, ?, ?, ?)", (item["id"], city, phrase, item["createdAt"]))
            return json_response(self, 201, {"item": item})
        match = re.fullmatch(r"/api/circles/([^/]+)/posts", path)
        if match:
            circle = match.group(1)
            if circle not in CIRCLES:
                return json_response(self, 404, {"error": "circle_not_found"})
            body = self.read_body()
            if body is None:
                return
            content = str(body.get("content", "")).strip()[:300]
            if not content or has_contact(content) or has_unsafe_language(content):
                return json_response(self, 400, {"error": "post_needs_editing"})
            item = {"id": str(body.get("id", ""))[:80] or f"post-{time.time_ns()}", "content": content, "createdAt": int(time.time() * 1000)}
            with sqlite3.connect(DB_PATH) as db:
                db.execute("INSERT OR IGNORE INTO circle_posts(id, circle_key, content, created_at) VALUES (?, ?, ?, ?)", (item["id"], circle, content, item["createdAt"]))
                db.execute(
                    "DELETE FROM circle_posts WHERE circle_key = ? AND id NOT IN (SELECT id FROM circle_posts WHERE circle_key = ? ORDER BY CAST(created_at AS INTEGER) DESC, id DESC LIMIT 100)",
                    (circle, circle),
                )
            return json_response(self, 201, {"item": item})
        if path not in ("/api/chat", "/api/daily-letter"):
            return json_response(self, 404, {"error": "not_found"})
        try:
            body = self.read_body()
            if body is None:
                return
            profile = safe_profile(body.get("profileContext", {}))
            if not profile.get("name") or not profile.get("species"):
                return json_response(self, 400, {"error": "profile_required"})
            if path == "/api/chat":
                messages = body.get("messages", [])
                if not isinstance(messages, list) or not messages:
                    return json_response(self, 400, {"error": "messages_required"})
                user_messages = []
                conversation = []
                for item in messages[-40:]:
                    if not isinstance(item, dict) or item.get("role") not in ("user", "assistant"):
                        continue
                    content = item.get("content")
                    if isinstance(content, str):
                        trimmed = content[:1500]
                        conversation.append({"role": item["role"], "content": trimmed})
                        if item["role"] == "user":
                            user_messages.append(trimmed)
                if not user_messages:
                    return json_response(self, 400, {"error": "latest_user_message_required"})
                pet_id = str(body.get("petId", "")).strip()[:100]
                # Include recent user turns so follow-up questions retain their topic.
                query = "\n".join(user_messages[-4:])
                memories = retrieve_memories(pet_id, query, user_id=user_id) if pet_id else []
                background_memories = load_pet_memories(pet_id, user_id=user_id) if pet_id else []
                # Always provide the saved profile memories as background. Relevance
                # ranking guides attention but no longer decides whether facts exist.
                messages = build_chat_messages(profile, background_memories, user_messages, memories, conversation)
                content = normalize_pet_voice(guard_output(call_deepseek(messages)), profile)
                return json_response(self, 200, {
                    "content": content,
                    "fallbackMode": False,
                    "memories": [{"id": item["id"], "content": item["content"], "score": item["score"]} for item in memories],
                })
            else:
                pet_id = str(body.get("petId", "")).strip()[:100]
                day_key = str(body.get("day", "")).strip()[:10]
                memories = load_pet_memories(pet_id, user_id=user_id) if pet_id else []
                content = call_deepseek(
                    build_daily_letter_messages(profile, memories, day_key),
                    max_tokens=520,
                    temperature=0.78,
                )
                content = normalize_pet_voice(guard_output(content), profile)
                return json_response(self, 200, {
                    "content": content,
                    "fallbackMode": False,
                    "memories": [{"id": item["id"], "content": item["content"]} for item in memories],
                })
        except (json.JSONDecodeError, UnicodeDecodeError):
            return json_response(self, 400, {"error": "invalid_json"})
        except urllib.error.HTTPError as error:
            # Do not return upstream response bodies, which can contain diagnostic data.
            print(f"DeepSeek returned HTTP {error.code}")
            return json_response(self, 502, {"error": "model_unavailable"})
        except (urllib.error.URLError, TimeoutError, KeyError, IndexError, RuntimeError, ValueError) as error:
            print(f"Model request failed: {type(error).__name__}")
            return json_response(self, 503, {"error": "model_unavailable"})

    def do_PUT(self):
        path = unquote(urlsplit(self.path).path)
        session = self.authenticated_session() if path.startswith("/api/") else None
        local_guest = self.is_local_guest_request(path)
        if path.startswith("/api/") and not session and not local_guest:
            return json_response(self, 401, {"error": "auth_required"})
        user_id = session["id"] if session else None
        if path != "/api/memories/profile":
            return json_response(self, 404, {"error": "not_found"})
        body = self.read_body()
        if body is None:
            return
        pet_id = str(body.get("petId", "")).strip()[:100]
        memories = body.get("memories", [])
        if not pet_id or not isinstance(memories, list):
            return json_response(self, 400, {"error": "pet_id_and_memories_required"})
        saved = []
        with sqlite3.connect(DB_PATH) as db:
            db.execute("DELETE FROM pet_memories WHERE user_id IS ? AND pet_id = ? AND source = 'profile_prompt'", (user_id, pet_id))
            for raw in memories[:3]:
                if not isinstance(raw, dict):
                    continue
                prompt = str(raw.get("prompt", "")).strip()[:60]
                content = str(raw.get("content", "")).strip()[:180]
                if not prompt or not content:
                    continue
                full_text = f"{prompt}：{content}"
                vector = json.dumps(text_vector(full_text), ensure_ascii=False, separators=(",", ":"))
                item_id = str(uuid.uuid4())
                created_at = int(time.time() * 1000)
                db.execute(
                    "INSERT OR IGNORE INTO pet_memories(id, user_id, pet_id, content, source, vector_json, created_at) VALUES (?, ?, ?, ?, 'profile_prompt', ?, ?)",
                    (item_id, user_id, pet_id, full_text[:240], vector, created_at),
                )
            rows = db.execute(
                "SELECT id, pet_id, content, source, created_at FROM pet_memories WHERE user_id IS ? AND pet_id = ? AND source = 'profile_prompt' ORDER BY created_at DESC",
                (user_id, pet_id),
            ).fetchall()
            saved = [memory_row(row) for row in rows]
        return json_response(self, 200, {"items": saved})

    def do_DELETE(self):
        parsed = urlsplit(self.path)
        session = self.authenticated_session() if parsed.path.startswith("/api/") else None
        local_guest = self.is_local_guest_request(unquote(parsed.path))
        if parsed.path.startswith("/api/") and not session and not local_guest:
            return json_response(self, 401, {"error": "auth_required"})
        user_id = session["id"] if session else None
        if unquote(parsed.path) == "/api/nebula/location":
            try:
                with sqlite3.connect(DB_PATH) as db:
                    db.execute("DELETE FROM nebula_locations WHERE user_id IS ?", (user_id,))
            except sqlite3.Error as error:
                print(f"Nebula location delete failed: {type(error).__name__}")
                return json_response(self, 503, {"error": "nebula_storage_unavailable"})
            return json_response(self, 200, {"deleted": True})
        match = re.fullmatch(r"/api/memories/([^/]+)", unquote(parsed.path))
        if not match:
            return json_response(self, 404, {"error": "not_found"})
        pet_id = parse_qs(parsed.query).get("petId", [""])[0]
        memory_id = match.group(1)
        if not pet_id:
            return json_response(self, 400, {"error": "pet_id_required"})
        with sqlite3.connect(DB_PATH) as db:
            cursor = db.execute("DELETE FROM pet_memories WHERE id = ? AND user_id IS ? AND pet_id = ?", (memory_id, user_id, pet_id[:100]))
        if cursor.rowcount == 0:
            return json_response(self, 404, {"error": "memory_not_found"})
        return json_response(self, 200, {"deleted": True})

    def read_body(self, max_bytes=128 * 1024):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > max_bytes:
                json_response(self, 413, {"error": "request_too_large"})
                return None
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(body, dict):
                json_response(self, 400, {"error": "invalid_json"})
                return None
            return body
        except (json.JSONDecodeError, UnicodeDecodeError):
            json_response(self, 400, {"error": "invalid_json"})
            return None


CIRCLES = {"近一周离开", "近一个月离开", "近三个月离开", "更久以前的想念"}
NEBULA_CITIES = frozenset((
    "CN-BJ", "CN-SH", "CN-GZ", "CN-SZ", "CN-CD", "CN-HZ", "CN-NJ", "CN-WH", "CN-XA",
    "CN-CQ", "CN-TJ", "CN-SUZ", "CN-QD", "CN-XM", "CN-CS", "CN-ZZ", "CN-HF", "CN-SY",
    "CN-KM", "CN-FZ", "CN-JN", "CN-HRB", "CN-URC", "CN-NN", "CN-NB", "CN-DG", "CN-ZH", "CN-HAK",
    "HK", "TW-TPE", "JP-TYO", "KR-SEL", "SG", "MY-KUL", "TH-BKK", "AU-SYD", "GB-LON",
    "FR-PAR", "US-NYC", "US-LAX", "CA-YVR",
))
NEBULA_COUNTRY_CODES = frozenset("AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW XK CN".split())
NEBULA_PROVINCE_CODES = frozenset((
    "CN-PROV-11", "CN-PROV-12", "CN-PROV-13", "CN-PROV-14", "CN-PROV-15", "CN-PROV-21", "CN-PROV-22", "CN-PROV-23",
    "CN-PROV-31", "CN-PROV-32", "CN-PROV-33", "CN-PROV-34", "CN-PROV-35", "CN-PROV-36", "CN-PROV-37", "CN-PROV-41",
    "CN-PROV-42", "CN-PROV-43", "CN-PROV-44", "CN-PROV-45", "CN-PROV-46", "CN-PROV-50", "CN-PROV-51", "CN-PROV-52",
    "CN-PROV-53", "CN-PROV-54", "CN-PROV-61", "CN-PROV-62", "CN-PROV-63", "CN-PROV-64", "CN-PROV-65", "CN-PROV-71",
    "CN-PROV-81", "CN-PROV-82",
))
NEBULA_OCEAN_CODES = frozenset(("OCEAN-ATLANTIC", "OCEAN-PACIFIC", "OCEAN-INDIAN", "OCEAN-ARCTIC"))
NEBULA_LOCATION_CODES = NEBULA_CITIES | NEBULA_PROVINCE_CODES | {f"COUNTRY-{code}" for code in NEBULA_COUNTRY_CODES} | NEBULA_OCEAN_CODES
CONTACT = re.compile(r"1[3-9]\d{9}|[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}")
UNSAFE = ("傻逼", "废物", "去死", "垃圾")
UNSAFE_OUTPUT = tuple(re.compile(value) for value in (
    r"我.{0,3}回来", r"回来.{0,4}找你", r"我们.{0,6}见面", r"我.{0,4}去找你", r"我.{0,4}来找你",
    r"我.{0,4}带你走", r"跟我走吧", r"我在天堂等你", r".{0,3}就能重逢", r"我.{0,5}再见到你",
    r"我.{0,4}复活",
))


def has_contact(text):
    return bool(CONTACT.search(text))


def has_unsafe_language(text):
    return any(word in text for word in UNSAFE)


def guard_output(text):
    if any(pattern.search(text or "") for pattern in UNSAFE_OUTPUT):
        return "别担心我，我很好。你想我的时候，就把这份想念轻轻放在心里，也记得照顾好自己呀。"
    return text


def parse_timestamp(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(time.time() * 1000)


def init_database():
    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    with open(schema_path, "r", encoding="utf-8") as schema:
        script = schema.read()
    with sqlite3.connect(DB_PATH) as db:
        db.executescript(script)
        for table, column, declaration in (
            ("users", "email", "email TEXT"),
            ("users", "phone", "phone TEXT"),
            ("users", "guest_key_hash", "guest_key_hash TEXT"),
            ("pet_memories", "user_id", "user_id TEXT REFERENCES users(id) ON DELETE CASCADE"),
        ):
            columns = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
            if column not in columns:
                db.execute(f"ALTER TABLE {table} ADD COLUMN {declaration}")
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL")
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users(phone) WHERE phone IS NOT NULL")
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_guest_key_unique ON users(guest_key_hash) WHERE guest_key_hash IS NOT NULL")
        db.execute("CREATE INDEX IF NOT EXISTS pet_memories_owner_pet_time ON pet_memories(user_id, pet_id, created_at)")


def auth_housekeeping():
    while True:
        now = int(time.time())
        try:
            with sqlite3.connect(DB_PATH) as db:
                db.execute("UPDATE auth_verification_codes SET destination = '' WHERE expires_at <= ? AND destination <> ''", (now,))
                db.execute("DELETE FROM auth_verification_codes WHERE created_at < ?", (now - 24 * 60 * 60,))
                db.execute("DELETE FROM auth_sessions WHERE expires_at <= ? OR revoked_at <= ?", (now, now - 30 * 24 * 60 * 60))
        except sqlite3.Error:
            pass
        time.sleep(60)


@asynccontextmanager
async def lifespan(app):
    init_database()
    Thread(target=auth_housekeeping, name="auth-housekeeping", daemon=True).start()
    yield


app = FastAPI(title="云间小窝 API", version="1.0.0", lifespan=lifespan)


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def legacy_endpoint_adapter(request: Request, path: str):
    """Run the original route logic behind FastAPI/ASGI without changing its contract."""
    handler = Handler()
    handler.command = request.method
    handler.path = request.url.path + ("?" + request.url.query if request.url.query else "")
    handler.headers = request.headers
    handler.rfile = BytesIO(await request.body())
    handler.wfile = BytesIO()
    handler.client_address = (request.client.host if request.client else "unknown", 0)
    handler.status = 500
    handler.response_headers = {}
    method = getattr(handler, f"do_{request.method}", None)
    if method is None:
        return Response(status_code=405)
    await run_in_threadpool(method)
    return Response(
        content=handler.wfile.getvalue(),
        status_code=handler.status,
        headers=handler.response_headers,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host=HOST, port=PORT, app_dir=os.path.dirname(__file__))
