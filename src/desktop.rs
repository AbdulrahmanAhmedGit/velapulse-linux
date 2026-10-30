//! Desktop process ownership. No compositor code or experimental system changes.
use crate::{NAME, PATH, config::Config};
use std::{path::PathBuf, sync::Arc, time::Duration};
use tokio::{process::Command, sync::Mutex};

fn data_root() -> PathBuf {
    if let Some(path) = std::env::var_os("VELAPULSE_DATA_DIR") {
        return path.into();
    }
    let data = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".local/share")
        })
        .join("velapulse");
    if data.join("backends/layer-shell.js").exists() {
        data
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    }
}

pub async fn preferences() -> anyhow::Result<()> {
    use std::os::unix::process::CommandExt;
    Err(std::process::Command::new("gjs")
        .arg("-m")
        .arg(data_root().join("backends/preferences.js"))
        .exec()
        .into())
}

pub async fn supervise(config: Arc<Mutex<Config>>) {
    let mut child: Option<tokio::process::Child> = None;
    let mut last = String::new();
    let mut failures = 0u8;
    let mut native = false;
    let mut started = std::time::Instant::now();
    let bus = zbus::Connection::session().await.ok();
    loop {
        let c = config.lock().await.clone();
        let key = format!("{}:{}", c.backend, c.surface);
        if key != last {
            if let Some(mut process) = child.take() {
                let _ = process.kill().await;
            }
            native = c.surface != "panel"
                && c.backend != "gnome-extension"
                && crate::capabilities::layer_shell().is_ok_and(|(layer, _)| layer);
            if c.backend == "layer-shell" && !native {
                eprintln!(
                    "Native layer shell unavailable (or panel selected); retaining GNOME fallback. Run velapulse doctor."
                );
            }
            failures = 0;
            last = key;
        }
        if child.is_some() && started.elapsed() > Duration::from_secs(8) {
            let ready = if let Some(bus) = &bus {
                if let Ok(proxy) = zbus::fdo::DBusProxy::new(bus).await {
                    proxy
                        .name_has_owner("io.github.velapulse.Renderer".try_into().unwrap())
                        .await
                        .unwrap_or(false)
                } else {
                    false
                }
            } else {
                false
            };
            if !ready {
                if let Some(mut process) = child.take() {
                    let _ = process.kill().await;
                }
                failures += 1;
                eprintln!(
                    "Native renderer did not map within 8 seconds; retaining GNOME fallback."
                );
            }
        }
        if let Some(process) = child.as_mut() {
            match process.try_wait() {
                Ok(None) => {}
                _ => {
                    child = None;
                    failures += 1;
                    eprintln!(
                        "Native renderer exited; GNOME fallback restored (attempt {failures}/3)."
                    );
                }
            }
        }
        if native && child.is_none() && failures < 3 {
            let preload = std::env::var("LD_PRELOAD").unwrap_or_default();
            match Command::new("gjs")
                .arg("-m")
                .arg(data_root().join("backends/layer-shell.js"))
                .env("GDK_BACKEND", "wayland")
                .env(
                    "LD_PRELOAD",
                    format!(
                        "libgtk4-layer-shell.so.0{sep}{preload}",
                        sep = if preload.is_empty() { "" } else { ":" }
                    ),
                )
                .kill_on_drop(true)
                .spawn()
            {
                Ok(process) => {
                    started = std::time::Instant::now();
                    child = Some(process)
                }
                Err(error) => {
                    failures += 1;
                    eprintln!("Native renderer could not start: {error}");
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

async fn output(program: &str, args: &[&str]) -> String {
    match tokio::time::timeout(
        Duration::from_secs(3),
        Command::new(program).args(args).kill_on_drop(true).output(),
    )
    .await
    {
        Ok(Ok(out)) => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        _ => "unavailable".into(),
    }
}

pub async fn doctor() -> anyhow::Result<()> {
    let capability = crate::capabilities::layer_shell();
    let config = Config::load();
    let mut owner = false;
    let mut renderer = false;
    let mut responsive = false;
    let mut shell_extensions = false;
    if let Ok(bus) = zbus::Connection::session().await {
        if let Ok(proxy) = zbus::fdo::DBusProxy::new(&bus).await {
            shell_extensions = proxy
                .name_has_owner("org.gnome.Shell.Extensions".try_into()?)
                .await
                .unwrap_or(false);
            owner = proxy
                .name_has_owner(NAME.try_into()?)
                .await
                .unwrap_or(false);
            renderer = proxy
                .name_has_owner("io.github.velapulse.Renderer".try_into()?)
                .await
                .unwrap_or(false);
        }
        if owner
            && let Ok(p) = zbus::Proxy::new(&bus, NAME, PATH, "io.github.velapulse.Service1").await
        {
            responsive = matches!(
                tokio::time::timeout(
                    Duration::from_secs(3),
                    p.call::<_, _, String>("Snapshot", &())
                )
                .await,
                Ok(Ok(_))
            );
        }
    }
    let data = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".local/share")
        });
    let layer = capability.as_ref().is_ok_and(|(layer, _)| *layer);
    let mut remedies = Vec::new();
    if !owner {
        remedies.push("Service is not running. Try velapulse snapshot to activate it; if ServiceUnknown persists, rerun scripts/install-user.sh.");
    }
    if owner && !responsive {
        remedies.push("Service owns its D-Bus name but did not answer within 3 seconds. Inspect journalctl --user -u velapulse.service.");
    }
    if !layer {
        remedies.push("Native layer shell is unavailable in this session. Enable the VelaPulse GNOME extension on supported GNOME; a newly installed extension may require logout/login.");
    }
    if layer && !renderer {
        remedies.push("Native renderer is not mapped. Check backend/panel preferences, GJS and Gtk4LayerShell dependencies, and the service journal. GNOME fallback stays available.");
    }
    if config.is_err() {
        remedies.push("Invalid configuration. Check the reported config error before restarting; retain a backup of config.json.");
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({
            "desktop":std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default(),
            "session":std::env::var("XDG_SESSION_TYPE").unwrap_or_default(),
            "wayland_display":std::env::var("WAYLAND_DISPLAY").unwrap_or_default(),
            "layer_shell":layer,"wayland_error":capability.err().map(|e| e.to_string()),
            "service_owner":owner,"service_responsive":responsive,"native_renderer_mapped":renderer,
            "service_status":output("systemctl", &["--user","is-active","velapulse.service"]).await,
            "gnome_version":output("gnome-shell", &["--version"]).await,
            "extension":if shell_extensions {output("gnome-extensions", &["info","velapulse@velapulse.local"]).await} else {"Extension service not running; inspect gnome-extensions info velapulse@velapulse.local in your graphical session".into()},
        "extension_installed":data.join("gnome-shell/extensions/velapulse@velapulse.local/metadata.json").exists(),
            "dbus_activation_installed":data.join("dbus-1/services/io.github.velapulse.Service.service").exists(),
            "renderer_files":data_root().join("backends/layer-shell.js").exists(),
            "config_error":config.err().map(|e|e.to_string()),"remediation":remedies
        }))?
    );
    Ok(())
}
