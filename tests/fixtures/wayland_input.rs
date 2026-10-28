//! Real Wayland input, restricted to a marked private test runtime.
use std::{
    fs::File,
    io::{BufRead, Write},
    os::fd::{AsFd, FromRawFd},
    time::Duration,
};
use wayland_client::{
    Connection, Dispatch, QueueHandle, delegate_noop,
    protocol::{wl_pointer, wl_registry, wl_seat},
};
use wayland_protocols_misc::zwp_virtual_keyboard_v1::client::{
    zwp_virtual_keyboard_manager_v1::ZwpVirtualKeyboardManagerV1,
    zwp_virtual_keyboard_v1::ZwpVirtualKeyboardV1,
};
use wayland_protocols_wlr::virtual_pointer::v1::client::{
    zwlr_virtual_pointer_manager_v1::ZwlrVirtualPointerManagerV1,
    zwlr_virtual_pointer_v1::ZwlrVirtualPointerV1,
};
#[derive(Default)]
struct State {
    pointer: Option<ZwlrVirtualPointerManagerV1>,
    keyboard: Option<ZwpVirtualKeyboardManagerV1>,
    seat: Option<wl_seat::WlSeat>,
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
        {
            match interface.as_str() {
                "zwlr_virtual_pointer_manager_v1" => {
                    s.pointer = Some(r.bind(name, version.min(2), q, ()))
                }
                "zwp_virtual_keyboard_manager_v1" => s.keyboard = Some(r.bind(name, 1, q, ())),
                "wl_seat" => s.seat = Some(r.bind(name, version.min(7), q, ())),
                _ => {}
            }
        }
    }
}
delegate_noop!(State: ignore ZwlrVirtualPointerManagerV1);
delegate_noop!(State: ignore ZwlrVirtualPointerV1);
delegate_noop!(State: ignore ZwpVirtualKeyboardManagerV1);
delegate_noop!(State: ignore ZwpVirtualKeyboardV1);
delegate_noop!(State: ignore wl_seat::WlSeat);
fn code(c: char) -> anyhow::Result<u32> {
    Ok(match c {
        'a' => 30,
        'b' => 48,
        'c' => 46,
        'd' => 32,
        'e' => 18,
        'f' => 33,
        'g' => 34,
        'h' => 35,
        'i' => 23,
        'j' => 36,
        'k' => 37,
        'l' => 38,
        'm' => 50,
        'n' => 49,
        'o' => 24,
        'p' => 25,
        'q' => 16,
        'r' => 19,
        's' => 31,
        't' => 20,
        'u' => 22,
        'v' => 47,
        'w' => 17,
        'x' => 45,
        'y' => 21,
        'z' => 44,
        '1'..='9' => 2 + c as u32 - '1' as u32,
        '0' => 11,
        ' ' => 57,
        '-' => 12,
        _ => anyhow::bail!("unsupported test character"),
    })
}
fn main() -> anyhow::Result<()> {
    let runtime = std::env::var("XDG_RUNTIME_DIR")?;
    anyhow::ensure!(
        std::env::var("VELAPULSE_ISOLATED_TEST").as_deref() == Ok("1")
            && std::path::Path::new(&runtime)
                .join("velapulse-test-session")
                .is_file(),
        "Requires a marked private compositor runtime"
    );
    let c = Connection::connect_to_env()?;
    let mut q = c.new_event_queue();
    c.display().get_registry(&q.handle(), ());
    let mut s = State::default();
    q.roundtrip(&mut s)?;
    let pointer = s
        .pointer
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("no virtual pointer"))?
        .create_virtual_pointer(s.seat.as_ref(), &q.handle(), ());
    let keyboard = s
        .keyboard
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("no virtual keyboard"))?
        .create_virtual_keyboard(
            s.seat.as_ref().ok_or_else(|| anyhow::anyhow!("no seat"))?,
            &q.handle(),
            (),
        );
    let map=b"xkb_keymap { xkb_keycodes { include \"evdev+aliases(qwerty)\" }; xkb_types { include \"complete\" }; xkb_compatibility { include \"complete\" }; xkb_symbols { include \"pc+us+inet(evdev)\" }; };\0";
    // SAFETY: a static NUL-terminated name; ownership of the valid fd passes to File.
    let fd = unsafe { libc::memfd_create(c"velapulse-test-keymap".as_ptr(), libc::MFD_CLOEXEC) };
    anyhow::ensure!(fd >= 0, "keymap fd failed");
    let mut file = unsafe { File::from_raw_fd(fd) };
    file.write_all(map)?;
    keyboard.keymap(1, file.as_fd(), map.len() as u32);
    q.roundtrip(&mut s)?;
    println!("READY");
    std::io::stdout().flush()?;
    let mut time = 0u32;
    let start = std::time::Instant::now();
    for line in std::io::stdin().lock().lines() {
        let line = line?;
        let a: Vec<&str> = line.split_whitespace().collect();
        match a.first().copied() {
            Some("click" | "drag") => {
                let values: Vec<u32> =
                    a[1..].iter().map(|v| v.parse()).collect::<Result<_, _>>()?;
                let drag = a[0] == "drag";
                anyhow::ensure!(
                    values.len() == if drag { 6 } else { 4 },
                    "click x y width height | drag x y end-x end-y width height"
                );
                let wh = if drag { 4 } else { 2 };
                time = time
                    .saturating_add(1)
                    .max(start.elapsed().as_millis() as u32);
                pointer.motion_absolute(time, values[0], values[1], values[wh], values[wh + 1]);
                pointer.frame();
                q.roundtrip(&mut s)?;
                std::thread::sleep(Duration::from_millis(40));
                time = time
                    .saturating_add(1)
                    .max(start.elapsed().as_millis() as u32);
                pointer.button(time, 0x110, wl_pointer::ButtonState::Pressed);
                pointer.frame();
                q.roundtrip(&mut s)?;
                if drag {
                    for step in 1..=10 {
                        let x =
                            values[0] as i64 + (values[2] as i64 - values[0] as i64) * step / 10;
                        let y =
                            values[1] as i64 + (values[3] as i64 - values[1] as i64) * step / 10;
                        time = time
                            .saturating_add(1)
                            .max(start.elapsed().as_millis() as u32);
                        pointer.motion_absolute(time, x as u32, y as u32, values[4], values[5]);
                        pointer.frame();
                        q.roundtrip(&mut s)?;
                        std::thread::sleep(Duration::from_millis(15));
                    }
                }
                time = time
                    .saturating_add(1)
                    .max(start.elapsed().as_millis() as u32);
                pointer.button(time, 0x110, wl_pointer::ButtonState::Released);
                pointer.frame();
                q.roundtrip(&mut s)?;
            }
            Some("key" | "type") => {
                let text = line
                    .split_once(' ')
                    .map(|(_, t)| t)
                    .ok_or_else(|| anyhow::anyhow!("key or text required"))?;
                let (mods, codes) = if a[0] == "type" {
                    (
                        0,
                        text.chars().map(code).collect::<anyhow::Result<Vec<_>>>()?,
                    )
                } else {
                    let (mods, key) = match text {
                        "ENTER" => (0, 28),
                        "BACKSPACE" => (0, 14),
                        "ESC" => (0, 1),
                        "TAB" => (0, 15),
                        "SHIFT+TAB" => (1, 15),
                        "CTRL+A" => (4, 30),
                        "SPACE" => (0, 57),
                        "DOWN" => (0, 108),
                        "UP" => (0, 103),
                        "LEFT" => (0, 105),
                        "RIGHT" => (0, 106),
                        "HOME" => (0, 102),
                        "END" => (0, 107),
                        _ => anyhow::bail!("unknown test key"),
                    };
                    (mods, vec![key])
                };
                keyboard.modifiers(mods, 0, 0, 0);
                for key in codes {
                    time = time
                        .saturating_add(1)
                        .max(start.elapsed().as_millis() as u32);
                    keyboard.key(time, key, 1);
                    time = time
                        .saturating_add(1)
                        .max(start.elapsed().as_millis() as u32);
                    keyboard.key(time, key, 0);
                    q.roundtrip(&mut s)?;
                }
                keyboard.modifiers(0, 0, 0, 0);
                q.roundtrip(&mut s)?;
            }
            _ => anyhow::bail!("click | drag | key | type"),
        }
        println!("OK");
        std::io::stdout().flush()?;
    }
    Ok(())
}
