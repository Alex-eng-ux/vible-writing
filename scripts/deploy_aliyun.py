#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import posixpath
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

try:
    import paramiko
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Missing dependency: paramiko. Install it with `python -m pip install paramiko`."
    ) from exc


ROOT = Path(__file__).resolve().parent.parent
DEPLOY_DIRNAME = ".deploy"
CONFIG_PATH = ROOT / DEPLOY_DIRNAME / "aliyun.json"
ARCHIVE_NAME = "deploy.zip"
REMOTE_ROOT = "/opt/vible-writing"
REMOTE_APP = f"{REMOTE_ROOT}/app"
REMOTE_ARCHIVE = f"{REMOTE_ROOT}/{ARCHIVE_NAME}"

EXCLUDE_NAMES = {
    ".git",
    ".next",
    "node_modules",
    "coverage",
    "downloads",
    ".npm-cache",
    ".deploy",
}
EXCLUDE_SUFFIXES = {".log", ".pyc", ".tsbuildinfo"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Deploy the current workspace to an Alibaba Cloud server.")
    parser.add_argument("--host", help="Server IP or hostname")
    parser.add_argument("--user", help="SSH username")
    parser.add_argument("--password", help="SSH password")
    parser.add_argument("--port", type=int, default=22, help="SSH port, default: 22")
    parser.add_argument("--app-dir", default=REMOTE_ROOT, help=f"Remote app root, default: {REMOTE_ROOT}")
    parser.add_argument("--save-config", action="store_true", help="Save connection info locally except password")
    parser.add_argument("--skip-build", action="store_true", help="Skip remote build step")
    return parser.parse_args()


def load_saved_config() -> dict[str, object]:
    if not CONFIG_PATH.exists():
        return {}
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def save_config(config: dict[str, object]) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def resolve_config(args: argparse.Namespace) -> dict[str, object]:
    saved = load_saved_config()
    host = args.host or os.getenv("ALIYUN_HOST") or saved.get("host")
    user = args.user or os.getenv("ALIYUN_USER") or saved.get("user")
    password = args.password or os.getenv("ALIYUN_PASSWORD")
    port = int(args.port or os.getenv("ALIYUN_PORT") or saved.get("port") or 22)
    app_dir = str(args.app_dir or saved.get("app_dir") or REMOTE_ROOT)

    if not host or not user or not password:
        raise SystemExit(
            "Missing connection info. Provide --host/--user/--password or set ALIYUN_HOST, ALIYUN_USER, ALIYUN_PASSWORD."
        )

    if args.save_config:
        save_config({"host": host, "user": user, "port": port, "app_dir": app_dir})

    return {
        "host": host,
        "user": user,
        "password": password,
        "port": port,
        "app_dir": app_dir,
    }


def should_exclude(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    if any(part in EXCLUDE_NAMES for part in rel.parts):
        return True
    if path.suffix in EXCLUDE_SUFFIXES:
        return True
    return False


def build_archive() -> Path:
    tmp_dir = Path(tempfile.mkdtemp(prefix="vible-deploy-"))
    archive_path = tmp_dir / ARCHIVE_NAME
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
      for path in ROOT.rglob("*"):
            if path.is_dir():
                continue
            if should_exclude(path):
                continue
            zf.write(path, path.relative_to(ROOT).as_posix())
    return archive_path


def print_header(message: str) -> None:
    print(f"\n=== {message} ===")


def run_remote(client: "paramiko.SSHClient", command: str, timeout: int = 1800) -> None:
    print(f"$ {command}")
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "ignore")
    err = stderr.read().decode("utf-8", "ignore")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.strip())
    if err.strip():
        print(err.strip())
    if code != 0:
        raise RuntimeError(f"Remote command failed ({code}): {command}")


def deploy(config: dict[str, object], skip_build: bool) -> None:
    archive_path = build_archive()
    host = str(config["host"])
    user = str(config["user"])
    password = str(config["password"])
    port = int(config["port"])
    app_dir = str(config["app_dir"]).rstrip("/")
    remote_archive = posixpath.join(app_dir, ARCHIVE_NAME)
    remote_app = posixpath.join(app_dir, "app")

    print_header(f"Connecting to {user}@{host}:{port}")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=host, port=port, username=user, password=password, timeout=20)

    try:
        print_header("Uploading package")
        run_remote(client, f"mkdir -p {app_dir}")
        with client.open_sftp() as sftp:
            sftp.put(str(archive_path), remote_archive)

        print_header("Preparing application")
        run_remote(client, f"cd {app_dir} && rm -rf app && mkdir -p app && unzip -o {ARCHIVE_NAME} -d app")
        run_remote(client, f"cd {remote_app} && cp -f .env.example .env || true")
        run_remote(
            client,
            f"""cd {remote_app} && python3 - <<'PY'
from pathlib import Path
p = Path('.env')
text = p.read_text(encoding='utf-8') if p.exists() else ''
lines = [line for line in text.splitlines() if not line.startswith('DATABASE_URL=')]
lines.insert(0, 'DATABASE_URL="file:./prisma/dev.db"')
p.write_text('\\n'.join(lines) + '\\n', encoding='utf-8')
PY""",
        )

        print_header("Installing and starting")
        run_remote(client, f"cd {remote_app} && npm install", timeout=2400)
        run_remote(client, f"cd {remote_app} && npx prisma generate")
        run_remote(client, f"cd {remote_app} && npx prisma db push")
        if not skip_build:
            run_remote(client, f"cd {remote_app} && npm run build", timeout=2400)
        run_remote(client, "pm2 delete vible-writing || true")
        run_remote(client, f"cd {remote_app} && pm2 start npm --name vible-writing -- run start")
        run_remote(client, "pm2 save")

        print_header("Configuring Nginx")
        nginx_conf = """server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
"""
        with client.open_sftp() as sftp:
            with sftp.file("/etc/nginx/sites-available/vible-writing", "w") as f:
                f.write(nginx_conf)
        run_remote(client, "ln -sf /etc/nginx/sites-available/vible-writing /etc/nginx/sites-enabled/vible-writing")
        run_remote(client, "rm -f /etc/nginx/sites-enabled/default")
        run_remote(client, "nginx -t")
        run_remote(client, "systemctl enable nginx")
        run_remote(client, "systemctl restart nginx")

        print_header("Health checks")
        run_remote(client, "curl -I --max-time 15 http://127.0.0.1:3000")
        run_remote(client, "curl -I --max-time 15 http://127.0.0.1")
        run_remote(client, f"curl -I --max-time 15 http://{host}")
    finally:
        client.close()
        shutil.rmtree(archive_path.parent, ignore_errors=True)


def main() -> int:
    args = parse_args()
    config = resolve_config(args)
    deploy(config, args.skip_build)
    print("\nDeploy completed.")
    print(f"App URL: http://{config['host']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
