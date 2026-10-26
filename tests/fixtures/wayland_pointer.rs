//! Input fixture for isolated compositor tests only. Do not run on the user's desktop.
use wayland_client::{
    Connection, Dispatch, QueueHandle, delegate_noop,
    protocol::{wl_pointer, wl_registry},
};
use wayland_protocols_wlr::virtual_pointer::v1::client::{
    zwlr_virtual_pointer_manager_v1::ZwlrVirtualPointerManagerV1,
    zwlr_virtual_pointer_v1::ZwlrVirtualPointerV1,
};
#[derive(Default)]
struct State {
    manager: Option<ZwlrVirtualPointerManagerV1>,
}
impl Dispatch<wl_registry::WlRegistry, ()> for State {
    fn event(
        s: &mut Self,
        r: &wl_registry::WlRegistry,
        e: wl_registry::Event,
        _: &(),
        _: &Connection,
        q: &QueueHandle<Self>,
    ) {
        if let wl_registry::Event::Global {
            name,
            interface,
            version,
        } = e
            && interface == "zwlr_virtual_pointer_manager_v1"
        {
            s.manager = Some(r.bind(name, version.min(2), q, ()));
        }
    }
}
delegate_noop!(State: ignore ZwlrVirtualPointerManagerV1);
delegate_noop!(State: ignore ZwlrVirtualPointerV1);
fn main() -> anyhow::Result<()> {
    anyhow::ensure!(
        std::env::var("VELAPULSE_ISOLATED_TEST").as_deref() == Ok("1"),
        "Set VELAPULSE_ISOLATED_TEST=1 only on an isolated compositor"
    );
    let args: Vec<_> = std::env::args().collect();
    let x = args.get(1).unwrap_or(&"640".into()).parse()?;
    let y = args.get(2).unwrap_or(&"50".into()).parse()?;
    let c = Connection::connect_to_env()?;
    let mut q = c.new_event_queue();
    c.display().get_registry(&q.handle(), ());
    let mut s = State::default();
    q.roundtrip(&mut s)?;
    let p = s
        .manager
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("virtual pointer not supported"))?
        .create_virtual_pointer(None, &q.handle(), ());
    q.roundtrip(&mut s)?;
    p.motion_absolute(1, x, y, 1280, 720);
    p.frame();
    q.roundtrip(&mut s)?;
    std::thread::sleep(std::time::Duration::from_millis(100));
    p.button(2, 0x110, wl_pointer::ButtonState::Pressed);
    p.frame();
    q.roundtrip(&mut s)?;
    p.button(3, 0x110, wl_pointer::ButtonState::Released);
    p.frame();
    q.roundtrip(&mut s)?;
    std::thread::sleep(std::time::Duration::from_millis(300));
    Ok(())
}
