#!/usr/bin/env python3
"""Integration-test stand-in for the compiled Tako agent (task 6.7).

Serves the real wire contract the provisioning suite exercises: a 0600 unix
socket at ~/.tako/agent.sock, newline-delimited JSON frames, hello →
hello_ack (echoing the client's version so the survive-disconnect handshake
validates), and `agent.status` responses. The REAL agent serving path is
covered by the UnixSocketAgentServer tests; this stand-in keeps the
container-based install → probe → uninstall harness honest without a
compiled binary inside the container.
"""

import json
import os
import socket

SOCKET_PATH = os.path.expanduser("~/.tako/agent.sock")


def send_frame(conn, frame):
    conn.sendall((json.dumps(frame) + "\n").encode())


def handle_request(conn, frame):
    if frame.get("type") == "agent.status":
        send_frame(
            conn,
            {
                "v": 1,
                "id": frame.get("id"),
                "kind": "response",
                "type": "agent.status",
                "payload": {
                    "agentVersion": "stand-in",
                    "protocol": 1,
                    "uptimeSec": 1,
                    "jobCount": 0,
                    "unitState": "active",
                    "linger": True,
                    "lingerByTako": False,
                },
            },
        )
    else:
        send_frame(
            conn,
            {
                "v": 1,
                "id": frame.get("id"),
                "kind": "error",
                "type": "error",
                "payload": {"code": "unknown_type", "message": "stand-in agent"},
            },
        )


def handle_conn(conn):
    buffer = b""
    while True:
        chunk = conn.recv(65536)
        if not chunk:
            return
        buffer += chunk
        while b"\n" in buffer:
            line, buffer = buffer.split(b"\n", 1)
            if not line.strip():
                continue
            frame = json.loads(line)
            kind = frame.get("kind")
            if kind == "hello":
                payload = frame.get("payload") or {}
                send_frame(
                    conn,
                    {
                        "v": 1,
                        "kind": "hello_ack",
                        "type": "hello_ack",
                        "payload": {
                            "agentVersion": payload.get("clientVersion", "0"),
                            "protocol": 1,
                            "agentStartId": "stand-in",
                        },
                    },
                )
            elif kind == "request":
                handle_request(conn, frame)


def main():
    try:
        os.unlink(SOCKET_PATH)
    except FileNotFoundError:
        pass
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(SOCKET_PATH)
    os.chmod(SOCKET_PATH, 0o600)
    server.listen(4)
    while True:
        conn, _ = server.accept()
        try:
            handle_conn(conn)
        except Exception:
            pass
        finally:
            conn.close()


main()
