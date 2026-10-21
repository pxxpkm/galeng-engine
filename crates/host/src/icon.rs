//! Write an `.ico` into a PE file as the Explorer / taskbar icon.

use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum IconError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Msg(String),
}

#[cfg(windows)]
#[path = "icon_win.rs"]
mod win;

/// Embed `ico` into `exe`. Off Windows this returns an error (export still copies the `.ico` file).
pub fn embed_ico(exe: &Path, ico: &Path) -> Result<(), IconError> {
    #[cfg(windows)]
    {
        win::embed_ico(exe, ico)
    }
    #[cfg(not(windows))]
    {
        let _ = (exe, ico);
        Err(IconError::Msg("icon embed is Windows-only".into()))
    }
}
