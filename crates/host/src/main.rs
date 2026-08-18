use std::net::SocketAddr;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use galeng_host::{find_player_exe, ProjectDir};
use serde::Deserialize;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};

struct App {
    project: ProjectDir,
    repo: Option<PathBuf>,
}

#[tokio::main]
async fn main() {
    if let Err(err) = run().await {
        eprintln!("galeng-host: {err}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut project = None;
    let mut bind = "127.0.0.1:3847".to_string();
    let mut static_dir: Option<PathBuf> = None;
    let mut open_browser = false;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--project" => {
                i += 1;
                project = Some(PathBuf::from(args.get(i).ok_or("--project needs a path")?));
            }
            "--bind" => {
                i += 1;
                bind = args.get(i).ok_or("--bind needs host:port")?.clone();
            }
            "--static" => {
                i += 1;
                static_dir = Some(PathBuf::from(args.get(i).ok_or("--static needs a dir")?));
            }
            "--open" => open_browser = true,
            other => return Err(format!("unknown arg {other}")),
        }
        i += 1;
    }
    let project = project.ok_or(
        "usage: galeng-host --project <dir> [--bind 127.0.0.1:3847] [--static <dir>] [--open]",
    )?;
    let dir = ProjectDir::open(&project).map_err(|e| e.to_string())?;
    let repo = galeng_schema::try_repo_root();
    let state = Arc::new(App { project: dir, repo });
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    let api = Router::new()
        .route("/api/health", get(health))
        .route("/api/project", get(get_project).put(put_project))
        .route("/api/scenes", get(list_scenes).post(create_scene))
        .route("/api/scenes/{id}", get(get_scene).put(put_scene).delete(delete_scene))
        .route("/api/scenes/{id}/archive", post(archive_scene))
        .route("/api/scenes/{id}/unarchive", post(unarchive_scene))
        .route("/api/archived", get(list_archived))
        .route("/api/archived/{id}", delete(delete_archived))
        .route("/api/assets", get(list_assets))
        .route("/api/asset-root", get(get_asset_root).put(put_asset_root))
        .route("/api/media/{*logical}", get(get_media))
        .route("/api/play", post(play))
        .route("/api/export", post(export_script))
        .route("/api/pack", post(pack_game))
        .route("/api/pick-dir", post(pick_dir))
        .route("/api/pick-file", post(pick_file));
    let app = if let Some(static_dir) = static_dir {
        let index = static_dir.join("index.html");
        if !index.is_file() {
            return Err(format!("--static has no index.html: {}", index.display()));
        }
        let serve = ServeDir::new(&static_dir).not_found_service(ServeFile::new(index));
        api.fallback_service(serve)
            .layer(cors)
            .with_state(state)
    } else {
        api.layer(cors).with_state(state)
    };
    let addr: SocketAddr = bind.parse().map_err(|e| format!("{e}"))?;
    println!("galeng-host on http://{addr}  project={}", project.display());
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| e.to_string())?;
    if open_browser {
        let url = format!("http://{addr}");
        let _ = Command::new("cmd").args(["/C", "start", "", &url]).spawn();
    }
    axum::serve(listener, app).await.map_err(|e| e.to_string())
}

async fn health() -> &'static str {
    "ok"
}

async fn get_project(State(app): State<Arc<App>>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let p = app.project.project().map_err(map_err)?;
    serde_json::to_value(&p)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn put_project(
    State(app): State<Arc<App>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let p = app.project.save_project(&body).map_err(map_err)?;
    serde_json::to_value(&p)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn list_scenes(State(app): State<Arc<App>>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let list = app.project.list_scenes().map_err(map_err)?;
    serde_json::to_value(list)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

#[derive(Deserialize)]
struct NewScene {
    id: String,
    title: Option<String>,
}

async fn create_scene(
    State(app): State<Arc<App>>,
    Json(body): Json<NewScene>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let scene = app
        .project
        .create_scene(&body.id, body.title.as_deref())
        .map_err(map_err)?;
    serde_json::to_value(&scene)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn get_scene(
    State(app): State<Arc<App>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let scene = app.project.load_scene(&id).map_err(map_err)?;
    serde_json::to_value(&scene)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn list_archived(
    State(app): State<Arc<App>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let list = app.project.list_archived().map_err(map_err)?;
    serde_json::to_value(list)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn archive_scene(
    State(app): State<Arc<App>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    app.project.archive_scene(&id).map_err(map_err)?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn unarchive_scene(
    State(app): State<Arc<App>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let scene = app.project.unarchive_scene(&id).map_err(map_err)?;
    serde_json::to_value(&scene)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn delete_scene(
    State(app): State<Arc<App>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    app.project.delete_scene(&id).map_err(map_err)?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn delete_archived(
    State(app): State<Arc<App>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    app.project.delete_archived(&id).map_err(map_err)?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn put_scene(
    State(app): State<Arc<App>>,
    Path(id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let scene = app.project.save_scene(&id, &body).map_err(map_err)?;
    serde_json::to_value(&scene)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn get_media(
    State(app): State<Arc<App>>,
    Path(logical): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let path = app.project.resolve_media(&logical).map_err(map_err)?;
    let bytes = std::fs::read(&path).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let ctype = galeng_host::media_content_type(&path);
    Ok(([(header::CONTENT_TYPE, ctype)], bytes))
}

async fn list_assets(State(app): State<Arc<App>>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let list = app.project.list_assets().map_err(map_err)?;
    serde_json::to_value(list)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

fn asset_root_json(path: PathBuf, is_default: bool) -> serde_json::Value {
    serde_json::json!({
        "path": path.to_string_lossy(),
        "isDefault": is_default,
    })
}

async fn get_asset_root(State(app): State<Arc<App>>) -> Json<serde_json::Value> {
    let (path, is_default) = app.project.asset_root_info();
    Json(asset_root_json(path, is_default))
}

#[derive(Default, Deserialize)]
struct AssetRootBody {
    path: Option<String>,
}

async fn put_asset_root(
    State(app): State<Arc<App>>,
    Json(body): Json<AssetRootBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let (path, is_default) = app
        .project
        .set_asset_root(body.path.as_deref())
        .map_err(map_err)?;
    Ok(Json(asset_root_json(path, is_default)))
}

#[derive(Deserialize)]
struct ExportBody {
    id: String,
    text: String,
}

async fn export_script(
    State(app): State<Arc<App>>,
    Json(body): Json<ExportBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let path = app
        .project
        .write_script_export(&body.id, &body.text)
        .map_err(map_err)?;
    Ok(Json(serde_json::json!({ "path": path })))
}

#[derive(Default, Deserialize)]
struct PackBody {
    #[serde(default)]
    strict: bool,
    #[serde(default)]
    out: Option<String>,
}

async fn pack_game(
    State(app): State<Arc<App>>,
    Json(body): Json<PackBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let out = body
        .out
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);
    let report = app
        .project
        .export_game_opts(
            find_player_exe(app.repo.as_deref()).as_deref(),
            body.strict,
            out.as_deref(),
        )
        .map_err(map_err)?;
    serde_json::to_value(&report)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn pick_dir() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let picked = tokio::task::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Galeng")
            .pick_folder()
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({
        "path": picked.map(|p| p.to_string_lossy().into_owned())
    })))
}

async fn pick_file(
    State(app): State<Arc<App>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let picked = tokio::task::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Galeng")
            .add_filter("PNG", &["png"])
            .add_filter("Images", &["png", "webp", "ico"])
            .pick_file()
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let Some(path) = picked else {
        return Ok(Json(serde_json::json!({ "logical": serde_json::Value::Null })));
    };
    let logical = app.project.logical_from_asset_file(&path).map_err(map_err)?;
    Ok(Json(serde_json::json!({ "logical": logical })))
}

#[derive(Deserialize)]
struct PlayBody {
    scene: Option<String>,
    beat: Option<u32>,
}

async fn play(
    State(app): State<Arc<App>>,
    Json(body): Json<PlayBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let exe = find_player_exe(app.repo.as_deref()).ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "build the player first: cargo build -p galeng-player".into(),
    ))?;
    let mut cmd = Command::new(exe);
    cmd.arg("--project").arg(&app.project.root);
    if let Some(scene) = body.scene {
        cmd.arg("--scene").arg(scene);
    }
    if let Some(beat) = body.beat {
        cmd.arg("--beat").arg(beat.to_string());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd.spawn()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

fn map_err(err: galeng_host::HostError) -> (StatusCode, String) {
    use galeng_host::HostError::*;
    let code = match &err {
        UnknownScene(_) | BadId | MissingAsset(_) => StatusCode::NOT_FOUND,
        Schema(_) | Msg(_) => StatusCode::BAD_REQUEST,
        Pack(galeng_packer::Error::Strict(_)) => StatusCode::BAD_REQUEST,
        Pack(_) => StatusCode::INTERNAL_SERVER_ERROR,
        Io(_) => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (code, err.to_string())
}
