use std::path::Path;

use serde::{Deserialize, Serialize};

const DEFAULT_VOLUME: u8 = 15;
const DEFAULT_SIZE: u8 = 60;

fn default_volume() -> u8 {
    DEFAULT_VOLUME
}

fn default_size() -> u8 {
    DEFAULT_SIZE
}

fn default_position() -> Position {
    Position::Center
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Position {
    TopLeft,
    TopCenter,
    TopRight,
    MiddleLeft,
    Center,
    MiddleRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub client_id: String,
    pub shared_key: String,
    #[serde(default = "default_volume")]
    pub volume: u8,
    #[serde(default = "default_position")]
    pub position: Position,
    #[serde(default = "default_size")]
    pub size: u8,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            client_id: std::env::var("POPSHOT_CLIENT_ID")
                .unwrap_or_else(|_| "dev".to_string()),
            shared_key: std::env::var("POPSHOT_SHARED_KEY")
                .unwrap_or_else(|_| "dev-key-change-me-1234567890".to_string()),
            volume: DEFAULT_VOLUME,
            position: default_position(),
            size: DEFAULT_SIZE,
        }
    }
}

pub fn load(path: &Path) -> Config {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(path: &Path, cfg: &Config) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(cfg)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    std::fs::write(path, json)
}
