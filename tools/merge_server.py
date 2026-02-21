#!/usr/bin/env python3
"""Local media helper for Browser Utility extension.

Exposes:
- POST /merge: combine downloaded video/audio tracks using ffmpeg.
- POST /download_youtube: download+merge YouTube media using yt-dlp.
- POST /download_manifest: download+merge generic HLS/DASH manifest URLs using yt-dlp.
- POST /download_page: download media from a generic page URL using yt-dlp.
"""

import argparse
import json
import os
import subprocess
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(body)


def safe_abs(path: str, base_dir: str) -> str:
    if os.path.isabs(path):
        return path
    return os.path.abspath(os.path.join(base_dir, path))


def run_cmd(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=False, capture_output=True, text=True)


def log_event(message: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] [merge-helper] {message}", flush=True)


def get_yt_dlp_version(yt_dlp_bin: str) -> str:
    try:
        proc = run_cmd([yt_dlp_bin, "--version"])
        if proc.returncode == 0:
            return (proc.stdout or "").strip() or "unknown"
    except Exception:
        return "unknown"
    return "unknown"


class MergeHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, ffmpeg_bin: str, yt_dlp_bin: str, **kwargs):
        self.ffmpeg_bin = ffmpeg_bin
        self.yt_dlp_bin = yt_dlp_bin
        self.yt_dlp_version = get_yt_dlp_version(yt_dlp_bin)
        super().__init__(*args, **kwargs)

    def do_OPTIONS(self):
        json_response(self, 200, {"ok": True})

    def do_POST(self):
        log_event(f"Incoming request: {self.path}")
        if self.path not in ("/merge", "/download_youtube", "/download_manifest", "/download_page"):
            log_event(f"Rejected request: unsupported path {self.path}")
            json_response(self, 404, {"ok": False, "error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception as exc:
            log_event(f"Request parse error on {self.path}: {exc}")
            json_response(self, 400, {"ok": False, "error": f"Invalid JSON: {exc}"})
            return

        if self.path == "/merge":
            video_path = payload.get("video_path")
            audio_path = payload.get("audio_path")
            output_path = payload.get("output_path")
            if not video_path or not audio_path or not output_path:
                log_event("Merge rejected: missing required fields")
                json_response(self, 400, {"ok": False, "error": "video_path, audio_path, output_path are required"})
                return

            base_dir = os.path.dirname(os.path.abspath(video_path)) or os.getcwd()
            out_abs = safe_abs(output_path, base_dir)
            os.makedirs(os.path.dirname(out_abs), exist_ok=True)

            cmd = [
                self.ffmpeg_bin,
                "-y",
                "-i",
                video_path,
                "-i",
                audio_path,
                "-c:v",
                "copy",
                "-c:a",
                "copy",
                out_abs,
            ]
            log_event(f"Merge start: video={video_path} audio={audio_path} out={out_abs}")

            try:
                proc = subprocess.run(cmd, check=False, capture_output=True, text=True)
                if proc.returncode != 0:
                    stderr = (proc.stderr or "").strip()[-1000:]
                    log_event(f"Merge failed: {stderr or 'ffmpeg failed'}")
                    json_response(self, 500, {"ok": False, "error": stderr or "ffmpeg failed"})
                    return
            except FileNotFoundError:
                log_event(f"Merge failed: ffmpeg not found at {self.ffmpeg_bin}")
                json_response(self, 500, {"ok": False, "error": f"ffmpeg not found: {self.ffmpeg_bin}"})
                return
            except Exception as exc:
                log_event(f"Merge failed with exception: {exc}")
                json_response(self, 500, {"ok": False, "error": str(exc)})
                return

            log_event(f"Merge success: {out_abs}")
            json_response(self, 200, {"ok": True, "output_path": out_abs})
            return

        if self.path == "/download_manifest":
            manifest_url = payload.get("manifest_url")
            title_hint = (payload.get("title_hint") or "stream-video").strip()
            page_url = (payload.get("page_url") or "").strip()
            if not manifest_url:
                log_event("Manifest download rejected: missing manifest_url")
                json_response(self, 400, {"ok": False, "error": "manifest_url is required"})
                return

            safe_title = "".join(ch if ch not in '<>:"/\\|?*' else " " for ch in title_hint).strip() or "stream-video"
            output_dir = payload.get("output_dir") or os.path.join(os.path.expanduser("~"), "Downloads", "BrowserUtility")
            os.makedirs(output_dir, exist_ok=True)
            output_template = os.path.join(output_dir, f"{safe_title}.%(ext)s")

            cmd = [
                self.yt_dlp_bin,
                "--no-playlist",
                "--merge-output-format",
                "mp4",
                "-o",
                output_template,
                manifest_url,
            ]
            if page_url:
                cmd = [*cmd[:-1], "--add-header", f"Referer: {page_url}", manifest_url]
            log_event(f"Manifest download start: manifest={manifest_url} out={output_template}")

            try:
                proc = run_cmd(cmd)
                if proc.returncode != 0:
                    stderr = (proc.stderr or "").strip()[-1500:]
                    stdout = (proc.stdout or "").strip()[-1000:]
                    msg = stderr or stdout or "yt-dlp manifest download failed"
                    msg = f"{msg}\n[yt-dlp:{self.yt_dlp_bin} version:{self.yt_dlp_version}]"
                    log_event(f"Manifest download failed: {msg}")
                    json_response(self, 500, {"ok": False, "error": msg})
                    return
            except FileNotFoundError:
                log_event(f"Manifest download failed: yt-dlp not found at {self.yt_dlp_bin}")
                json_response(self, 500, {"ok": False, "error": f"yt-dlp not found: {self.yt_dlp_bin}"})
                return
            except Exception as exc:
                log_event(f"Manifest download failed with exception: {exc}")
                json_response(self, 500, {"ok": False, "error": str(exc)})
                return

            log_event(f"Manifest download success: out_dir={output_dir}")
            json_response(
                self,
                200,
                {
                    "ok": True,
                    "output_dir": output_dir,
                    "message": "Manifest download started/completed via yt-dlp helper."
                },
            )
            return

        if self.path == "/download_page":
            page_url = payload.get("page_url")
            title_hint = (payload.get("title_hint") or "page-video").strip()
            if not page_url:
                log_event("Page download rejected: missing page_url")
                json_response(self, 400, {"ok": False, "error": "page_url is required"})
                return

            safe_title = "".join(ch if ch not in '<>:"/\\|?*' else " " for ch in title_hint).strip() or "page-video"
            output_dir = payload.get("output_dir") or os.path.join(os.path.expanduser("~"), "Downloads", "BrowserUtility")
            os.makedirs(output_dir, exist_ok=True)
            output_template = os.path.join(output_dir, f"{safe_title}.%(ext)s")

            cmd = [
                self.yt_dlp_bin,
                "--no-playlist",
                "--merge-output-format",
                "mp4",
                "-o",
                output_template,
                page_url,
            ]
            log_event(f"Page download start: page={page_url} out={output_template}")
            try:
                proc = run_cmd(cmd)
                if proc.returncode != 0:
                    stderr = (proc.stderr or "").strip()[-1500:]
                    stdout = (proc.stdout or "").strip()[-1000:]
                    msg = stderr or stdout or "yt-dlp page download failed"
                    msg = f"{msg}\n[yt-dlp:{self.yt_dlp_bin} version:{self.yt_dlp_version}]"
                    log_event(f"Page download failed: {msg}")
                    json_response(self, 500, {"ok": False, "error": msg})
                    return
            except FileNotFoundError:
                log_event(f"Page download failed: yt-dlp not found at {self.yt_dlp_bin}")
                json_response(self, 500, {"ok": False, "error": f"yt-dlp not found: {self.yt_dlp_bin}"})
                return
            except Exception as exc:
                log_event(f"Page download failed with exception: {exc}")
                json_response(self, 500, {"ok": False, "error": str(exc)})
                return

            log_event(f"Page download success: out_dir={output_dir}")
            json_response(
                self,
                200,
                {
                    "ok": True,
                    "output_dir": output_dir,
                    "message": "Page download started/completed via yt-dlp helper."
                },
            )
            return

        video_url = payload.get("video_url")
        title_hint = (payload.get("title_hint") or "youtube-video").strip()
        if not video_url:
            log_event("YouTube download rejected: missing video_url")
            json_response(self, 400, {"ok": False, "error": "video_url is required"})
            return

        safe_title = "".join(ch if ch not in '<>:"/\\|?*' else " " for ch in title_hint).strip() or "youtube-video"
        output_dir = payload.get("output_dir") or os.path.join(os.path.expanduser("~"), "Downloads", "BrowserUtility")
        os.makedirs(output_dir, exist_ok=True)
        output_template = os.path.join(output_dir, f"{safe_title}.%(ext)s")

        try:
            # Retry with multiple extraction strategies because YouTube signatures
            # and available clients can vary.
            attempts = [
                [
                    self.yt_dlp_bin,
                    "--no-playlist",
                    "-f",
                    "bv*+ba/b",
                    "--merge-output-format",
                    "mp4",
                    "-o",
                    output_template,
                    video_url,
                ],
                [
                    self.yt_dlp_bin,
                    "--no-playlist",
                    "--extractor-args",
                    "youtube:player_client=ios,mweb,web",
                    "--merge-output-format",
                    "mp4",
                    "-o",
                    output_template,
                    video_url,
                ],
                [
                    self.yt_dlp_bin,
                    "--no-playlist",
                    "--extractor-args",
                    "youtube:player_client=ios,web_embedded,mweb,web",
                    "-f",
                    "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
                    "--merge-output-format",
                    "mp4",
                    "-o",
                    output_template,
                    video_url,
                ],
            ]

            last_proc = None
            log_event(f"YouTube download start: url={video_url} out={output_template} attempts={len(attempts)}")
            for idx, cmd in enumerate(attempts, start=1):
                log_event(f"YouTube attempt {idx}/{len(attempts)}")
                proc = run_cmd(cmd)
                last_proc = proc
                if proc.returncode == 0:
                    log_event(f"YouTube download success on attempt {idx}: out_dir={output_dir}")
                    json_response(
                        self,
                        200,
                        {
                            "ok": True,
                            "output_dir": output_dir,
                            "message": "YouTube download started/completed via yt-dlp helper."
                        },
                    )
                    return

            stderr = (last_proc.stderr or "").strip()[-1500:] if last_proc else ""
            stdout = (last_proc.stdout or "").strip()[-1000:] if last_proc else ""
            msg = stderr or stdout or "yt-dlp failed"
            msg = f"{msg}\n[yt-dlp:{self.yt_dlp_bin} version:{self.yt_dlp_version}]"
            if "nsig extraction failed" in msg.lower():
                msg = (
                    f"{msg}\nHint: local yt-dlp may be outdated. Re-run installer to fetch latest nightly yt-dlp, restart helper, and retry."
                )
            log_event(f"YouTube download failed after all attempts: {msg}")
            json_response(self, 500, {"ok": False, "error": msg})
            return
        except FileNotFoundError:
            log_event(f"YouTube download failed: yt-dlp not found at {self.yt_dlp_bin}")
            json_response(self, 500, {"ok": False, "error": f"yt-dlp not found: {self.yt_dlp_bin}"})
            return
        except Exception as exc:
            log_event(f"YouTube download failed with exception: {exc}")
            json_response(self, 500, {"ok": False, "error": str(exc)})
            return

    def log_message(self, fmt, *args):
        return


def main() -> None:
    parser = argparse.ArgumentParser(description="Run local media helper service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--yt-dlp", default="yt-dlp", dest="yt_dlp")
    args = parser.parse_args()

    def handler(*h_args, **h_kwargs):
        return MergeHandler(*h_args, ffmpeg_bin=args.ffmpeg, yt_dlp_bin=args.yt_dlp, **h_kwargs)

    server = ThreadingHTTPServer((args.host, args.port), handler)
    log_event(
        f"Media helper listening on http://{args.host}:{args.port} "
        f"(endpoints: /merge, /download_youtube, /download_manifest, /download_page) "
        f"[yt-dlp:{args.yt_dlp} version:{get_yt_dlp_version(args.yt_dlp)}]"
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
