//! Explicit command ownership. Agent stdout is streamed, never retained as activity text.
use crate::developer::Event;
use anyhow::{Result, ensure};
use futures_util::StreamExt;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
fn session() -> String {
    format!("{}-{}", std::process::id(), crate::history::now())
}
fn project() -> String {
    std::env::current_dir()
        .ok()
        .and_then(|p| {
            p.file_name()
                .map(|n| n.to_string_lossy().chars().take(60).collect())
        })
        .unwrap_or_default()
}
async fn send(proxy: &zbus::Proxy<'_>, event: &Event) -> Result<String> {
    Ok(proxy
        .call("DeveloperEvent", &(serde_json::to_string(event)?,))
        .await?)
}
pub async fn run(args: &[String], codex: bool) -> Result<()> {
    let (title, program, arguments) = if codex {
        ensure!(
            !args.is_empty(),
            "Usage: velapulse codex LABEL [codex exec arguments...]"
        );
        (
            args[0].clone(),
            "codex".to_string(),
            [
                vec!["exec".to_string(), "--json".into()],
                args[1..].to_vec(),
            ]
            .concat(),
        )
    } else {
        let split = args
            .iter()
            .position(|a| a == "--")
            .ok_or_else(|| anyhow::anyhow!("Usage: velapulse run TITLE -- PROGRAM [ARGS...]"))?;
        ensure!(split == 1 && args.len() > 2, "missing command");
        (args[0].clone(), args[2].clone(), args[3..].to_vec())
    };
    let connection = zbus::Connection::session().await?;
    let proxy = zbus::Proxy::new(
        &connection,
        crate::NAME,
        crate::PATH,
        "io.github.velapulse.Service1",
    )
    .await?;
    let mut cancel = proxy.receive_signal("TaskCancelled").await?;
    let mut event = Event {
        provider: if codex { "codex" } else { "task" }.into(),
        session: session(),
        state: "starting".into(),
        title,
        project: project(),
        message: if codex {
            "Codex exec structured events"
        } else {
            "Explicitly launched command"
        }
        .into(),
        event_id: String::new(),
        progress: None,
    };
    let id = send(&proxy, &event).await?;
    let mut command = tokio::process::Command::new(program);
    command.args(arguments).kill_on_drop(true);
    command.as_std_mut().process_group(0);
    if codex {
        command.stdout(std::process::Stdio::piped());
    }
    let mut child = match command.spawn() {
        Ok(c) => c,
        Err(e) => {
            event.state = "failed".into();
            event.message = "Command could not start".into();
            let _ = send(&proxy, &event).await;
            return Err(e.into());
        }
    };
    let pid = child.id().unwrap();
    event.state = "running".into();
    send(&proxy, &event).await?;
    let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(8);
    let reader = child.stdout.take().map(|stdout| {
        tokio::spawn(async move {
            let mut input = BufReader::new(stdout);
            loop {
                let mut line = Vec::new();
                let n = (&mut input)
                    .take(65537)
                    .read_until(b'\n', &mut line)
                    .await
                    .unwrap_or(0);
                if n == 0 {
                    break;
                }
                if n > 65536 {
                    let _ = tx.send("failed".into()).await;
                    break;
                }
                let _ = tokio::io::stdout().write_all(&line).await;
                if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&line) {
                    let state = match v["type"].as_str().unwrap_or("") {
                        "thread.started" | "turn.started" => Some("running"),
                        "turn.completed" => Some("completed"),
                        "turn.failed" | "error" => Some("failed"),
                        _ => None,
                    };
                    if let Some(s) = state
                        && tx.send(s.into()).await.is_err()
                    {
                        break;
                    }
                }
            }
        })
    });
    let mut interrupted = false;
    let mut stream_open = codex;
    let status = loop {
        tokio::select! {
         result=child.wait()=>break result?,
         signal=cancel.next()=>{if signal.is_none(){unsafe{libc::kill(-(pid as i32),libc::SIGKILL);}let _=child.wait().await;anyhow::bail!("Activity bus disconnected; owned command stopped");}else if signal.is_some_and(|m|m.body().deserialize::<(String,)>().is_ok_and(|(s,)|s==id)){interrupted=true;unsafe{libc::kill(-(pid as i32),libc::SIGTERM);}tokio::time::sleep(std::time::Duration::from_secs(2)).await;unsafe{libc::kill(-(pid as i32),libc::SIGKILL);}break child.wait().await?;}},
         _=tokio::signal::ctrl_c()=>{interrupted=true;unsafe{libc::kill(-(pid as i32),libc::SIGKILL);}break child.wait().await?;},
         _=tokio::time::sleep(std::time::Duration::from_secs(10))=>{event.state="running".into();if send(&proxy,&event).await.is_err(){unsafe{libc::kill(-(pid as i32),libc::SIGKILL);}let _=child.wait().await;anyhow::bail!("Activity service disconnected; owned command stopped");}},
         state=rx.recv(),if stream_open=>{if let Some(state)=state{event.state=state;event.message="Codex structured lifecycle event".into();let _=send(&proxy,&event).await;}else{stream_open=false;}}
        }
    };
    if let Some(reader) = reader {
        let _ = reader.await;
    }
    event.state = if interrupted {
        "cancelled"
    } else if status.success() {
        "completed"
    } else {
        "failed"
    }
    .into();
    event.message = format!(
        "Exit status: {}",
        status
            .code()
            .map(|n| n.to_string())
            .unwrap_or_else(|| "terminated".into())
    );
    send(&proxy, &event).await?;
    if !status.success() {
        std::process::exit(status.code().unwrap_or(130));
    }
    Ok(())
}
use std::os::unix::process::CommandExt;
