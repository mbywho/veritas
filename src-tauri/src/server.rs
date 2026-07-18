use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State, Query, Request
    },
    response::{Html, IntoResponse, Response},
    routing::get,
    Router,
};
use std::collections::HashMap;
use tower_http::services::ServeFile;
use tower::ServiceExt;
use futures_util::{sink::SinkExt, stream::StreamExt};
use serde::Deserialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

// The state shared with the axum router
pub struct ServerState {
    pub tx: broadcast::Sender<String>,
    pub app_handle: AppHandle,
}

#[derive(Deserialize)]
struct RemoteCommand {
    action: String,
}

pub async fn start_server(app_handle: AppHandle, tx: broadcast::Sender<String>, shutdown_rx: tokio::sync::oneshot::Receiver<()>) {
    let state = Arc::new(ServerState { tx, app_handle });

    let app = Router::new()
        .route("/obs", get(obs_handler))
        .route("/remote", get(remote_handler))
        .route("/media", get(media_handler))
        .route("/ws", get(ws_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    println!("Server running on http://localhost:8080");
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        })
        .await
        .unwrap();
}

async fn obs_handler() -> Html<&'static str> {
    Html(include_str!("obs.html"))
}

async fn remote_handler() -> Html<&'static str> {
    Html(include_str!("remote.html"))
}

async fn media_handler(
    Query(params): Query<HashMap<String, String>>,
    request: Request,
) -> Response {
    let path = params.get("path").cloned().unwrap_or_default();
    if path.is_empty() {
        return Response::builder()
            .status(axum::http::StatusCode::BAD_REQUEST)
            .body(axum::body::Body::from("Missing path parameter"))
            .unwrap();
    }
    
    if !std::path::Path::new(&path).exists() {
        return Response::builder()
            .status(axum::http::StatusCode::NOT_FOUND)
            .body(axum::body::Body::from("File not found"))
            .unwrap();
    }

    match ServeFile::new(path).oneshot(request).await {
        Ok(res) => res.into_response(),
        Err(err) => Response::builder()
            .status(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
            .body(axum::body::Body::from(format!("Error: {}", err)))
            .unwrap(),
    }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<ServerState>>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<ServerState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.tx.subscribe();
    let app_handle = state.app_handle.clone();

    // Spawn a task that sends messages from the broadcast channel to the websocket
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Spawn a task that receives messages from the websocket and emits to Tauri
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            if let Ok(cmd) = serde_json::from_str::<RemoteCommand>(&text) {
                // Emit event to React UI
                let _ = app_handle.emit("remote_action", cmd.action);
            }
        }
    });

    // Wait until either task completes (meaning the socket closed)
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}
