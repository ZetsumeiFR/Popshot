use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio_tungstenite::{
    connect_async,
    tungstenite::protocol::{frame::Utf8Bytes, Message},
};

#[derive(Serialize, Debug)]
struct HelloMessage {
    #[serde(rename = "type")]
    kind: &'static str,
    #[serde(rename = "clientId")]
    client_id: String,
    #[serde(rename = "sharedKey")]
    shared_key: String,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct MediaInfo {
    pub url: String,
    pub mime: String,
    pub size: u64,
    pub filename: String,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct DisplayPayload {
    pub id: String,
    pub media: MediaInfo,
    pub text: Option<String>,
    pub duration: u32,
    pub from: String,
    #[serde(rename = "channelId")]
    pub channel_id: String,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
enum ServerMessage {
    #[serde(rename = "ack")]
    Ack {
        #[serde(rename = "clientId")]
        client_id: String,
    },
    #[serde(rename = "error")]
    Error { reason: String },
    #[serde(rename = "display")]
    Display(DisplayPayload),
}

/// Spawns the relay connection loop and returns its task handle so the caller
/// can `.abort()` it to force a reconnect with new credentials.
pub fn spawn(
    app: AppHandle,
    url: String,
    client_id: String,
    shared_key: String,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(e) = run_once(&app, &url, &client_id, &shared_key).await {
                log::error!("[ws] connection error: {e:#}");
            }
            log::info!("[ws] reconnecting in 5s...");
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    })
}

async fn run_once(
    app: &AppHandle,
    url: &str,
    client_id: &str,
    shared_key: &str,
) -> anyhow::Result<()> {
    log::info!("[ws] connecting to {url} as {client_id}");
    let (ws, _response) = connect_async(url).await?;
    let (mut write, mut read) = ws.split();

    let hello = HelloMessage {
        kind: "hello",
        client_id: client_id.to_string(),
        shared_key: shared_key.to_string(),
    };
    let hello_json = serde_json::to_string(&hello)?;
    write.send(Message::Text(Utf8Bytes::from(hello_json))).await?;

    while let Some(msg) = read.next().await {
        let msg = msg?;
        match msg {
            Message::Text(text) => {
                let text_str: &str = text.as_ref();
                match serde_json::from_str::<ServerMessage>(text_str) {
                    Ok(ServerMessage::Ack { client_id }) => {
                        log::info!("[ws] ack received for {client_id}");
                    }
                    Ok(ServerMessage::Error { reason }) => {
                        log::error!("[ws] server error: {reason}");
                        return Err(anyhow::anyhow!("server error: {reason}"));
                    }
                    Ok(ServerMessage::Display(payload)) => {
                        log::info!("[ws] display received: id={}", payload.id);
                        if let Err(e) = app.emit("popshot://display", &payload) {
                            log::error!("[ws] emit failed: {e}");
                        }
                    }
                    Err(e) => {
                        log::warn!("[ws] parse error: {e}; raw: {text_str}");
                    }
                }
            }
            Message::Close(frame) => {
                log::info!("[ws] server closed: {frame:?}");
                break;
            }
            Message::Ping(_) | Message::Pong(_) | Message::Binary(_) | Message::Frame(_) => {}
        }
    }
    Ok(())
}
