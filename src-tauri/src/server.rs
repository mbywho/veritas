use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, Request, State,
    },
    response::{Html, IntoResponse, Response},
    routing::get,
    Router,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use std::collections::HashMap;
use tower::ServiceExt;
use tower_http::services::ServeFile;

use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

// The state shared with the axum router
pub struct ServerState {
    pub tx: broadcast::Sender<String>,
    pub app_handle: AppHandle,
}

pub async fn start_server(
    app_handle: AppHandle,
    tx: broadcast::Sender<String>,
) {
    let state = Arc::new(ServerState { tx, app_handle });

    let app = Router::new()
        .route("/obs", get(obs_handler))
        .route("/remote", get(remote_handler))
        .route("/media", get(media_handler))
        .route("/ws", get(ws_handler))
        .with_state(state);

    let local_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());

    let subject_alt_names = vec!["localhost".to_string(), "127.0.0.1".to_string(), local_ip];
    
    let cert = match rcgen::generate_simple_self_signed(subject_alt_names) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to generate certificate: {:?}", e);
            // Fallback to exit or something? Just panic for now since it shouldn't fail
            panic!("Certificate generation failed: {:?}", e);
        }
    };
    
    let config = axum_server::tls_rustls::RustlsConfig::from_der(
        vec![cert.cert.der().to_vec()],
        cert.signing_key.serialize_der(),
    )
    .await
    .unwrap();

    let app_https = app.clone();
    
    tokio::spawn(async move {
        let addr = std::net::SocketAddr::from(([0, 0, 0, 0], 8443));
        println!("HTTPS Server running on https://localhost:8443");
        if let Err(e) = axum_server::bind_rustls(addr, config)
            .serve(app_https.into_make_service())
            .await
        {
            eprintln!("HTTPS Server error: {}", e);
        }
    });

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    println!("Server running on http://localhost:8080");

    axum::serve(listener, app)
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

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                // Emit the raw JSON string directly to React UI
                let _ = app_handle.emit("remote_action", text);
            }
        }
    });

    // Wait until either task completes (meaning the socket closed)
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}
