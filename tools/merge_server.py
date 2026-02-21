#!/usr/bin/env python3
"""Local merge helper for Browser Utility extension.

Exposes POST /merge to combine downloaded video/audio tracks using ffmpeg.
"""

import argparse
import json
import os
import subprocess
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


class MergeHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, ffmpeg_bin: str, **kwargs):
        self.ffmpeg_bin = ffmpeg_bin
        super().__init__(*args, **kwargs)

    def do_OPTIONS(self):
        json_response(self, 200, {"ok": True})

    def do_POST(self):
        if self.path != "/merge":
            json_response(self, 404, {"ok": False, "error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception as exc:
            json_response(self, 400, {"ok": False, "error": f"Invalid JSON: {exc}"})
            return

        video_path = payload.get("video_path")
        audio_path = payload.get("audio_path")
        output_path = payload.get("output_path")
        if not video_path or not audio_path or not output_path:
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

        try:
            proc = subprocess.run(cmd, check=False, capture_output=True, text=True)
            if proc.returncode != 0:
                stderr = (proc.stderr or "").strip()[-1000:]
                json_response(self, 500, {"ok": False, "error": stderr or "ffmpeg failed"})
                return
        except FileNotFoundError:
            json_response(self, 500, {"ok": False, "error": f"ffmpeg not found: {self.ffmpeg_bin}"})
            return
        except Exception as exc:
            json_response(self, 500, {"ok": False, "error": str(exc)})
            return

        json_response(self, 200, {"ok": True, "output_path": out_abs})

    def log_message(self, fmt, *args):
        return


def main() -> None:
    parser = argparse.ArgumentParser(description="Run local ffmpeg merge helper service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args()

    def handler(*h_args, **h_kwargs):
        return MergeHandler(*h_args, ffmpeg_bin=args.ffmpeg, **h_kwargs)

    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Merge server listening on http://{args.host}:{args.port}/merge")
    server.serve_forever()


if __name__ == "__main__":
    main()
