use wayland_client::{Connection, Dispatch, QueueHandle, protocol::wl_registry};
#[derive(Default)]
struct Registry {
    globals: Vec<(String, u32)>,
}
impl Dispatch<wl_registry::WlRegistry, ()> for Registry {
    fn event(
        state: &mut Self,
        _: &wl_registry::WlRegistry,
        event: wl_registry::Event,
        _: &(),
        _: &Connection,
        _: &QueueHandle<Self>,
    ) {
        if let wl_registry::Event::Global {
            interface, version, ..
        } = event
        {
            state.globals.push((interface, version));
        }
    }
}
pub fn detect() -> anyhow::Result<()> {
    let c = Connection::connect_to_env()?;
    let mut q = c.new_event_queue();
    c.display().get_registry(&q.handle(), ());
    let mut state = Registry::default();
    q.roundtrip(&mut state)?;
    let layer = state
        .globals
        .iter()
        .any(|(n, _)| n == "zwlr_layer_shell_v1");
    println!(
        "{}",
        serde_json::json!({"layer_shell":layer,"recommended_backend":if layer {"layer-shell"} else {"gnome-extension"},"globals":state.globals})
    );
    Ok(())
}
