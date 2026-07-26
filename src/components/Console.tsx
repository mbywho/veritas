import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

interface LogEntry {
    id: number;
    type: "log" | "warn" | "error";
    message: string;
    timestamp: string;
}

export default function Console() {
    const [logs, setLogs] = useState<LogEntry[]>([]);

    useEffect(() => {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;

        const addLog = (type: "log" | "warn" | "error", args: unknown[]) => {
            const message = args
                .map((arg) =>
                    typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
                )
                .join(" ");

            const timestamp = new Date().toLocaleTimeString();
            setLogs((prev) => [
                ...prev,
                { id: Date.now() + Math.random(), type, message, timestamp },
            ]);
        };

        console.log = (...args) => {
            originalLog(...args);
            addLog("log", args);
        };
        console.warn = (...args) => {
            originalWarn(...args);
            addLog("warn", args);
        };
        console.error = (...args) => {
            originalError(...args);
            addLog("error", args);
        };

        // Capture global unhandled exceptions
        const handleGlobalError = (event: ErrorEvent) => {
            addLog("error", [`Uncaught Exception: ${event.message} (${event.filename}:${event.lineno})`]);
        };

        // Capture unhandled async promise rejections
        const handleRejection = (event: PromiseRejectionEvent) => {
            addLog("error", [`Unhandled Promise Rejection: ${event.reason}`]);
        };

        window.addEventListener("error", handleGlobalError);
        window.addEventListener("unhandledrejection", handleRejection);

        // Listen for backend (Rust) logs/errors pushed via Tauri events
        const unlistenPromise = listen<{ type: "log" | "warn" | "error"; message: string }>(
            "backend-log",
            (event) => {
                addLog(event.payload.type, [`[Rust Backend] ${event.payload.message}`]);
            }
        );

        return () => {
            console.log = originalLog;
            console.warn = originalWarn;
            console.error = originalError;
            window.removeEventListener("error", handleGlobalError);
            window.removeEventListener("unhandledrejection", handleRejection);
            unlistenPromise.then((unlisten) => unlisten());
        };
    }, []);

    return (
        <div
            style={{
                background: "#1e1e1e",
                color: "#d4d4d4",
                height: "100vh",
                padding: "10px",
                fontFamily: "monospace",
                display: "flex",
                flexDirection: "column",
                boxSizing: "border-box",
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "10px",
                    borderBottom: "1px solid #333",
                    paddingBottom: "8px",
                }}
            >
                <span style={{ fontSize: "14px" }}>
                    <strong>Veritas Developer Console (Full Diagnostics)</strong>
                </span>
                <button
                    onClick={() => setLogs([])}
                    style={{
                        background: "#333",
                        color: "#fff",
                        border: "none",
                        padding: "4px 10px",
                        cursor: "pointer",
                        borderRadius: "4px",
                        fontSize: "12px",
                    }}
                >
                    Clear
                </button>
            </div>
            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                }}
            >
                {logs.length === 0 ? (
                    <span style={{ color: "#666", fontStyle: "italic" }}>
                        Waiting for logs, warnings, or errors...
                    </span>
                ) : (
                    logs.map((log) => (
                        <div
                            key={log.id}
                            style={{
                                color:
                                    log.type === "error"
                                        ? "#f48771"
                                        : log.type === "warn"
                                            ? "#cca700"
                                            : "#d4d4d4",
                                background:
                                    log.type === "error"
                                        ? "rgba(244, 135, 113, 0.1)"
                                        : "transparent",
                                padding: "3px 6px",
                                borderRadius: "3px",
                                wordBreak: "break-all",
                                whiteSpace: "pre-wrap",
                                fontSize: "13px",
                            }}
                        >
                            <span style={{ color: "#666", marginRight: "8px" }}>
                                [{log.timestamp}]
                            </span>
                            <span
                                style={{
                                    textTransform: "uppercase",
                                    fontSize: "10px",
                                    marginRight: "8px",
                                    padding: "1px 4px",
                                    background: "#333",
                                    borderRadius: "2px",
                                    color: "#aaa",
                                }}
                            >
                                {log.type}
                            </span>
                            {log.message}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}